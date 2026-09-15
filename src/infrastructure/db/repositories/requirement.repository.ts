import { createHash } from 'crypto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { MYSQL_POOL } from '../mysql-pool';
import { toIsoString, toNumber } from './row-utils';

export interface ParsedRequirementSection {
  sectionKey: string;
  heading: string;
  headingPath: string;
  content: string;
  contentHash: string;
  sectionOrder: number;
  statusCode: number;
}

export interface StoredRequirementSection extends ParsedRequirementSection {
  requirementSectionId: number;
  requirementVersionId: number;
}

export interface StoredRequirementVersion {
  requirementVersionId: number;
  requirementDocumentId: number;
  versionNumber: number;
  changeSummary: string | null;
  updatedAt: string | null;
}

interface RequirementDocumentRow extends RowDataPacket {
  requirement_document_id: number | string;
}

interface RequirementVersionRow extends RowDataPacket {
  requirement_version_id: number | string;
  requirement_document_id: number | string;
  version_number: number;
  change_summary: string | null;
  updated_at: Date | string | null;
}

interface RequirementSectionRow extends RowDataPacket {
  requirement_section_id: number | string;
  requirement_version_id: number | string;
  section_key: string;
  heading: string;
  heading_path: string;
  content_hash: string;
  content: string;
  section_order: number;
  status_code: number;
}

@Injectable()
export class RequirementRepository {
  constructor(@Inject(MYSQL_POOL) private readonly pool: Pool) {}

  async createVersionFromMarkdown(
    projectId: number,
    markdown: string,
    changeSummary: string | null,
    userId: number,
  ): Promise<{ version: StoredRequirementVersion; sections: StoredRequirementSection[] }> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();

      const requirementDocumentId = await this.ensureRequirementDocument(connection, projectId, userId);
      const previousSections = await this.listLatestSectionHashes(connection, requirementDocumentId);
      const nextVersionNumber = await this.nextVersionNumber(connection, requirementDocumentId);
      const parsedSections = this.parseMarkdownSections(markdown, previousSections);

      const [versionResult] = await connection.execute<ResultSetHeader>(
        `INSERT INTO requirement_versions (
           requirement_document_id,
           version_number,
           raw_markdown,
           change_summary,
           updated_by_user_id,
           updated_at
         )
         VALUES (
           :requirementDocumentId,
           :versionNumber,
           :rawMarkdown,
           :changeSummary,
           :updatedByUserId,
           CURRENT_TIMESTAMP
         )`,
        {
          requirementDocumentId,
          versionNumber: nextVersionNumber,
          rawMarkdown: markdown,
          changeSummary,
          updatedByUserId: userId,
        },
      );

      const requirementVersionId = versionResult.insertId;
      const sections: StoredRequirementSection[] = [];
      for (const section of parsedSections) {
        const [sectionResult] = await connection.execute<ResultSetHeader>(
          `INSERT INTO requirement_sections (
             requirement_version_id,
             section_key,
             heading,
             heading_path,
             content_hash,
             content,
             section_order,
             status_code,
             updated_by_user_id,
             updated_at
           )
           VALUES (
             :requirementVersionId,
             :sectionKey,
             :heading,
             :headingPath,
             :contentHash,
             :content,
             :sectionOrder,
             :statusCode,
             :updatedByUserId,
             CURRENT_TIMESTAMP
           )`,
          {
            requirementVersionId,
            sectionKey: section.sectionKey,
            heading: section.heading,
            headingPath: section.headingPath,
            contentHash: section.contentHash,
            content: section.content,
            sectionOrder: section.sectionOrder,
            statusCode: section.statusCode,
            updatedByUserId: userId,
          },
        );
        sections.push({ ...section, requirementSectionId: sectionResult.insertId, requirementVersionId });
      }

      await connection.commit();

      return {
        version: {
          requirementVersionId,
          requirementDocumentId,
          versionNumber: nextVersionNumber,
          changeSummary,
          updatedAt: new Date().toISOString(),
        },
        sections,
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async updateLatestVersionText(
    projectId: number,
    markdown: string,
    changeSummary: string | null,
    userId: number,
  ): Promise<{ version: StoredRequirementVersion; sections: StoredRequirementSection[] }> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();

      const requirementDocumentId = await this.ensureRequirementDocument(connection, projectId, userId);
      const latestVersion = await this.findLatestVersion(connection, requirementDocumentId);
      if (!latestVersion) {
        await connection.rollback();
        return this.createVersionFromMarkdown(projectId, markdown, changeSummary, userId);
      }

      const parsedSections = this.parseMarkdownSections(markdown, new Map());
      await connection.execute(
        `UPDATE requirement_versions
         SET raw_markdown = :rawMarkdown,
             change_summary = :changeSummary,
             updated_by_user_id = :updatedByUserId,
             updated_at = CURRENT_TIMESTAMP
         WHERE requirement_version_id = :requirementVersionId`,
        {
          rawMarkdown: markdown,
          changeSummary,
          updatedByUserId: userId,
          requirementVersionId: latestVersion.requirementVersionId,
        },
      );

      const existingSections = await this.listVersionSectionsForConnection(connection, latestVersion.requirementVersionId);
      const existingSectionByKey = new Map(existingSections.map((section) => [section.sectionKey, section]));
      const parsedSectionKeys = new Set(parsedSections.map((section) => section.sectionKey));
      const sections: StoredRequirementSection[] = [];

      for (const section of parsedSections) {
        const existingSection = existingSectionByKey.get(section.sectionKey);
        if (existingSection) {
          await connection.execute(
            `UPDATE requirement_sections
             SET heading = :heading,
                 heading_path = :headingPath,
                 content_hash = :contentHash,
                 content = :content,
                 section_order = :sectionOrder,
                 status_code = :statusCode,
                 updated_by_user_id = :updatedByUserId,
                 updated_at = CURRENT_TIMESTAMP
             WHERE requirement_section_id = :requirementSectionId`,
            {
              heading: section.heading,
              headingPath: section.headingPath,
              contentHash: section.contentHash,
              content: section.content,
              sectionOrder: section.sectionOrder,
              statusCode: existingSection.contentHash === section.contentHash ? 0 : 1,
              updatedByUserId: userId,
              requirementSectionId: existingSection.requirementSectionId,
            },
          );
          sections.push({
            ...section,
            statusCode: existingSection.contentHash === section.contentHash ? 0 : 1,
            requirementSectionId: existingSection.requirementSectionId,
            requirementVersionId: latestVersion.requirementVersionId,
          });
          continue;
        }

        const [sectionResult] = await connection.execute<ResultSetHeader>(
          `INSERT INTO requirement_sections (
             requirement_version_id,
             section_key,
             heading,
             heading_path,
             content_hash,
             content,
             section_order,
             status_code,
             updated_by_user_id,
             updated_at
           )
           VALUES (
             :requirementVersionId,
             :sectionKey,
             :heading,
             :headingPath,
             :contentHash,
             :content,
             :sectionOrder,
             1,
             :updatedByUserId,
             CURRENT_TIMESTAMP
           )`,
          {
            requirementVersionId: latestVersion.requirementVersionId,
            sectionKey: section.sectionKey,
            heading: section.heading,
            headingPath: section.headingPath,
            contentHash: section.contentHash,
            content: section.content,
            sectionOrder: section.sectionOrder,
            updatedByUserId: userId,
          },
        );
        sections.push({
          ...section,
          statusCode: 1,
          requirementSectionId: sectionResult.insertId,
          requirementVersionId: latestVersion.requirementVersionId,
        });
      }

      for (const existingSection of existingSections) {
        if (parsedSectionKeys.has(existingSection.sectionKey)) continue;
        await connection.execute(
          `UPDATE requirement_sections
           SET section_order = :sectionOrder,
               status_code = 1,
               updated_by_user_id = :updatedByUserId,
               updated_at = CURRENT_TIMESTAMP
           WHERE requirement_section_id = :requirementSectionId`,
          {
            sectionOrder: parsedSections.length + existingSection.sectionOrder,
            updatedByUserId: userId,
            requirementSectionId: existingSection.requirementSectionId,
          },
        );
      }

      await connection.commit();

      return {
        version: {
          ...latestVersion,
          changeSummary,
          updatedAt: new Date().toISOString(),
        },
        sections,
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async listVersions(projectId: number): Promise<StoredRequirementVersion[]> {
    const [rows] = await this.pool.execute<RequirementVersionRow[]>(
      `SELECT rv.requirement_version_id,
              rv.requirement_document_id,
              rv.version_number,
              rv.change_summary,
              rv.updated_at
       FROM requirement_documents rd
       INNER JOIN requirement_versions rv ON rv.requirement_document_id = rd.requirement_document_id
       WHERE rd.project_id = :projectId
       ORDER BY rv.version_number DESC`,
      { projectId },
    );
    return rows.map((row) => this.toVersion(row));
  }

  async listVersionSections(projectId: number, requirementVersionId: number): Promise<StoredRequirementSection[]> {
    const [rows] = await this.pool.execute<RequirementSectionRow[]>(
      `SELECT rs.requirement_section_id,
              rs.requirement_version_id,
              rs.section_key,
              rs.heading,
              rs.heading_path,
              rs.content_hash,
              rs.content,
              rs.section_order,
              rs.status_code
       FROM requirement_sections rs
       INNER JOIN requirement_versions rv ON rv.requirement_version_id = rs.requirement_version_id
       INNER JOIN requirement_documents rd ON rd.requirement_document_id = rv.requirement_document_id
       WHERE rd.project_id = :projectId
         AND rv.requirement_version_id = :requirementVersionId
       ORDER BY rs.section_order ASC`,
      { projectId, requirementVersionId },
    );
    return rows.map((row) => this.toSection(row));
  }

  async requireVersion(projectId: number, requirementVersionId: number): Promise<StoredRequirementVersion> {
    const [rows] = await this.pool.execute<RequirementVersionRow[]>(
      `SELECT rv.requirement_version_id,
              rv.requirement_document_id,
              rv.version_number,
              rv.change_summary,
              rv.updated_at
       FROM requirement_versions rv
       INNER JOIN requirement_documents rd ON rd.requirement_document_id = rv.requirement_document_id
       WHERE rd.project_id = :projectId
         AND rv.requirement_version_id = :requirementVersionId
       LIMIT 1`,
      { projectId, requirementVersionId },
    );
    if (!rows[0]) throw new NotFoundException(`Requirement version ${requirementVersionId} was not found.`);
    return this.toVersion(rows[0]);
  }

  private async findLatestVersion(
    connection: PoolConnection,
    requirementDocumentId: number,
  ): Promise<StoredRequirementVersion | undefined> {
    const [rows] = await connection.execute<RequirementVersionRow[]>(
      `SELECT requirement_version_id,
              requirement_document_id,
              version_number,
              change_summary,
              updated_at
       FROM requirement_versions
       WHERE requirement_document_id = :requirementDocumentId
       ORDER BY version_number DESC
       LIMIT 1`,
      { requirementDocumentId },
    );
    return rows[0] ? this.toVersion(rows[0]) : undefined;
  }

  private async listVersionSectionsForConnection(
    connection: PoolConnection,
    requirementVersionId: number,
  ): Promise<StoredRequirementSection[]> {
    const [rows] = await connection.execute<RequirementSectionRow[]>(
      `SELECT requirement_section_id,
              requirement_version_id,
              section_key,
              heading,
              heading_path,
              content_hash,
              content,
              section_order,
              status_code
       FROM requirement_sections
       WHERE requirement_version_id = :requirementVersionId
       ORDER BY section_order ASC`,
      { requirementVersionId },
    );
    return rows.map((row) => this.toSection(row));
  }

  private async ensureRequirementDocument(connection: PoolConnection, projectId: number, userId: number): Promise<number> {
    const [projectRows] = await connection.execute<RowDataPacket[]>(
      `SELECT project_id
       FROM projects
       WHERE project_id = :projectId
       LIMIT 1`,
      { projectId },
    );
    if (!projectRows[0]) throw new NotFoundException(`Project ${projectId} was not found.`);

    await connection.execute(
      `INSERT INTO requirement_documents (project_id, source_type_code, updated_by_user_id, updated_at)
       VALUES (:projectId, 0, :updatedByUserId, CURRENT_TIMESTAMP)
       ON DUPLICATE KEY UPDATE
         updated_by_user_id = VALUES(updated_by_user_id),
         updated_at = CURRENT_TIMESTAMP`,
      { projectId, updatedByUserId: userId },
    );

    const [rows] = await connection.execute<RequirementDocumentRow[]>(
      `SELECT requirement_document_id
       FROM requirement_documents
       WHERE project_id = :projectId
       LIMIT 1`,
      { projectId },
    );
    if (!rows[0]) throw new NotFoundException(`Project ${projectId} was not found.`);
    return toNumber(rows[0].requirement_document_id);
  }

  private async nextVersionNumber(connection: PoolConnection, requirementDocumentId: number): Promise<number> {
    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version_number
       FROM requirement_versions
       WHERE requirement_document_id = :requirementDocumentId`,
      { requirementDocumentId },
    );
    return toNumber(rows[0].next_version_number);
  }

  private async listLatestSectionHashes(connection: PoolConnection, requirementDocumentId: number): Promise<Map<string, string>> {
    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT rs.section_key, rs.content_hash
       FROM requirement_sections rs
       INNER JOIN requirement_versions rv ON rv.requirement_version_id = rs.requirement_version_id
       WHERE rv.requirement_document_id = :requirementDocumentId
         AND rv.version_number = (
           SELECT MAX(latest.version_number)
           FROM requirement_versions latest
           WHERE latest.requirement_document_id = :requirementDocumentId
         )`,
      { requirementDocumentId },
    );
    return new Map(rows.map((row) => [String(row.section_key), String(row.content_hash)]));
  }

  private parseMarkdownSections(markdown: string, previousHashes: Map<string, string>): ParsedRequirementSection[] {
    const lines = markdown.split(/\r?\n/);
    const sections: Omit<ParsedRequirementSection, 'contentHash' | 'statusCode'>[] = [];
    let headingStack: { level: number; title: string }[] = [];
    let current: { heading: string; headingPath: string; sectionKey: string; lines: string[] } | null = null;

    const flushCurrent = () => {
      if (!current) return;
      sections.push({
        sectionKey: current.sectionKey,
        heading: current.heading,
        headingPath: current.headingPath,
        content: current.lines.join('\n').trim(),
        sectionOrder: sections.length,
      });
    };

    for (const line of lines) {
      const headingMatch = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
      if (!headingMatch) {
        current?.lines.push(line);
        continue;
      }

      flushCurrent();
      const level = headingMatch[1].length;
      const title = headingMatch[2].trim();
      headingStack = headingStack.filter((heading) => heading.level < level);
      headingStack.push({ level, title });
      const headingPath = headingStack.map((heading) => heading.title).join(' / ');
      current = {
        heading: title,
        headingPath,
        sectionKey: this.toSectionKey(headingPath, sections.length),
        lines: [line],
      };
    }

    flushCurrent();

    const normalizedSections = sections.length > 0
      ? sections
      : [
          {
            sectionKey: 'document',
            heading: 'Requirement Document',
            headingPath: 'Requirement Document',
            content: markdown.trim(),
            sectionOrder: 0,
          },
        ];

    return normalizedSections.map((section) => {
      const contentHash = createHash('sha256').update(section.content).digest('hex');
      return {
        ...section,
        contentHash,
        statusCode: previousHashes.get(section.sectionKey) === contentHash ? 0 : 1,
      };
    });
  }

  private toSectionKey(headingPath: string, index: number): string {
    const slug = headingPath
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\p{L}\p{N}]+/gu, '/')
      .replace(/^\/+|\/+$/g, '')
      .slice(0, 210);
    return `${slug || 'section'}-${index + 1}`;
  }

  private toVersion(row: RequirementVersionRow): StoredRequirementVersion {
    return {
      requirementVersionId: toNumber(row.requirement_version_id),
      requirementDocumentId: toNumber(row.requirement_document_id),
      versionNumber: row.version_number,
      changeSummary: row.change_summary,
      updatedAt: toIsoString(row.updated_at),
    };
  }

  private toSection(row: RequirementSectionRow): StoredRequirementSection {
    return {
      requirementSectionId: toNumber(row.requirement_section_id),
      requirementVersionId: toNumber(row.requirement_version_id),
      sectionKey: row.section_key,
      heading: row.heading,
      headingPath: row.heading_path,
      contentHash: row.content_hash,
      content: row.content,
      sectionOrder: row.section_order,
      statusCode: row.status_code,
    };
  }
}
