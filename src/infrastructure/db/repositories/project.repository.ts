import { Inject, Injectable } from '@nestjs/common';
import { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { Role, roleCodeToRole } from '../../../common/domain/role';
import { MYSQL_POOL } from '../mysql-pool';
import { toIsoString, toNumber } from './row-utils';

interface ProjectSummaryRow extends RowDataPacket {
  project_id: number | string;
  name: string;
  status_code: number;
  updated_at: Date | string;
  owner_user_id: number | string | null;
  owner_name: string | null;
  owner_role_code: number | null;
  member_count: number | string;
  admin_count: number | string;
  pm_count: number | string;
  qa_count: number | string;
  developer_count: number | string;
  requirement_version_id: number | string | null;
  version_number: number | null;
  change_summary: string | null;
  raw_markdown: string | null;
  requirement_updated_at: Date | string | null;
  section_count: number | string;
  test_case_count: number | string;
  draft_count: number | string;
  published_count: number | string;
  rejected_count: number | string;
}

interface RequirementSectionRow extends RowDataPacket {
  requirement_section_id: number | string;
  section_key: string;
  heading: string;
  heading_path: string;
  section_order: number;
  status_code: number;
  test_case_count: number | string;
  draft_count: number | string;
  published_count: number | string;
  rejected_count: number | string;
}

export interface DbProjectSummary {
  project_id: number;
  name: string;
  status_code: number;
  owner: {
    user_id: number;
    name: string;
    role: Role;
  } | null;
  members_summary: {
    total: number;
    admins: number;
    pms: number;
    qas: number;
    developers: number;
  };
  latest_requirement_version: {
    requirement_version_id: number;
    version_number: number;
    change_summary: string | null;
    raw_markdown: string | null;
    updated_at: string | null;
  } | null;
  section_count: number;
  test_case_count: number;
  draft_count: number;
  published_count: number;
  rejected_count: number;
  updated_at: string;
}

export interface DbRequirementSectionSummary {
  requirement_section_id: number;
  section_key: string;
  heading: string;
  heading_path: string;
  section_order: number;
  status_code: number;
  test_case_count: number;
  draft_count: number;
  published_count: number;
  rejected_count: number;
}

@Injectable()
export class ProjectRepository {
  constructor(@Inject(MYSQL_POOL) private readonly pool: Pool) {}

  async listForUser(userId: number, role: Role): Promise<DbProjectSummary[]> {
    const whereClause = role === Role.Admin
      ? 'p.status_code = 1'
      : 'p.status_code = 1 AND EXISTS (SELECT 1 FROM project_members access_pm WHERE access_pm.project_id = p.project_id AND access_pm.user_id = :userId)';

    const [rows] = await this.pool.execute<ProjectSummaryRow[]>(this.projectSummaryQuery(whereClause), { userId });
    return rows.map((row) => this.toProjectSummary(row));
  }

  async findSummaryById(projectId: number): Promise<DbProjectSummary | undefined> {
    const [rows] = await this.pool.execute<ProjectSummaryRow[]>(this.projectSummaryQuery('p.project_id = :projectId'), {
      projectId,
    });
    return rows[0] ? this.toProjectSummary(rows[0]) : undefined;
  }

  async createProject(name: string, userId: number, roleCode: number): Promise<number> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [projectResult] = await connection.execute<ResultSetHeader>(
        `INSERT INTO projects (name, status_code)
         VALUES (:name, 1)`,
        { name },
      );
      const projectId = projectResult.insertId;

      await connection.execute(
        `INSERT INTO project_members (project_id, user_id, role_code)
         VALUES (:projectId, :userId, :roleCode)
         ON DUPLICATE KEY UPDATE role_code = VALUES(role_code)`,
        { projectId, userId, roleCode },
      );

      await connection.commit();
      return projectId;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async updateProjectName(projectId: number, name: string): Promise<void> {
    await this.pool.execute(
      `UPDATE projects
       SET name = :name,
           updated_at = CURRENT_TIMESTAMP
       WHERE project_id = :projectId`,
      { projectId, name },
    );
  }

  async listLatestVersionSections(projectId: number): Promise<DbRequirementSectionSummary[]> {
    const [rows] = await this.pool.execute<RequirementSectionRow[]>(
      `SELECT rs.requirement_section_id,
              rs.section_key,
              rs.heading,
              rs.heading_path,
              rs.section_order,
              rs.status_code,
              COUNT(tc.test_case_id) AS test_case_count,
              SUM(CASE WHEN tc.current_status_code = 0 THEN 1 ELSE 0 END) AS draft_count,
              SUM(CASE WHEN tc.current_status_code = 1 THEN 1 ELSE 0 END) AS published_count,
              SUM(CASE WHEN tc.current_status_code = 2 THEN 1 ELSE 0 END) AS rejected_count
       FROM requirement_documents rd
       INNER JOIN requirement_versions rv ON rv.requirement_document_id = rd.requirement_document_id
       INNER JOIN requirement_sections rs ON rs.requirement_version_id = rv.requirement_version_id
       LEFT JOIN test_case_versions tcv ON tcv.requirement_section_id = rs.requirement_section_id
       LEFT JOIN test_cases tc ON tc.current_test_case_version_id = tcv.test_case_version_id
       WHERE rd.project_id = :projectId
         AND rv.version_number = (
           SELECT MAX(latest_rv.version_number)
           FROM requirement_versions latest_rv
           WHERE latest_rv.requirement_document_id = rd.requirement_document_id
         )
       GROUP BY rs.requirement_section_id,
                rs.section_key,
                rs.heading,
                rs.heading_path,
                rs.section_order,
                rs.status_code
       ORDER BY rs.section_order ASC, rs.requirement_section_id ASC`,
      { projectId },
    );
    return rows.map((row) => ({
      requirement_section_id: toNumber(row.requirement_section_id),
      section_key: row.section_key,
      heading: row.heading,
      heading_path: row.heading_path,
      section_order: row.section_order,
      status_code: row.status_code,
      test_case_count: toNumber(row.test_case_count),
      draft_count: toNumber(row.draft_count),
      published_count: toNumber(row.published_count),
      rejected_count: toNumber(row.rejected_count),
    }));
  }

  private projectSummaryQuery(whereClause: string): string {
    return `SELECT p.project_id,
                   p.name,
                   p.status_code,
                   p.updated_at,
                   owner.user_id AS owner_user_id,
                   owner.name AS owner_name,
                   owner.role_code AS owner_role_code,
                   COUNT(DISTINCT pm.project_member_id) AS member_count,
                   COUNT(DISTINCT CASE WHEN pm.role_code = 0 THEN pm.project_member_id END) AS admin_count,
                   COUNT(DISTINCT CASE WHEN pm.role_code = 1 THEN pm.project_member_id END) AS pm_count,
                   COUNT(DISTINCT CASE WHEN pm.role_code = 2 THEN pm.project_member_id END) AS qa_count,
                   COUNT(DISTINCT CASE WHEN pm.role_code IN (3, 4, 5, 6) THEN pm.project_member_id END) AS developer_count,
                   latest_rv.requirement_version_id,
                   latest_rv.version_number,
                   latest_rv.change_summary,
                   latest_rv.raw_markdown,
                   latest_rv.updated_at AS requirement_updated_at,
                   COUNT(DISTINCT rs.requirement_section_id) AS section_count,
                   COUNT(DISTINCT tc.test_case_id) AS test_case_count,
                   COUNT(DISTINCT CASE WHEN tc.current_status_code = 0 THEN tc.test_case_id END) AS draft_count,
                   COUNT(DISTINCT CASE WHEN tc.current_status_code = 1 THEN tc.test_case_id END) AS published_count,
                   COUNT(DISTINCT CASE WHEN tc.current_status_code = 2 THEN tc.test_case_id END) AS rejected_count
            FROM projects p
            LEFT JOIN project_members pm ON pm.project_id = p.project_id
            LEFT JOIN users owner ON owner.user_id = (
              SELECT owner_pm.user_id
              FROM project_members owner_pm
              WHERE owner_pm.project_id = p.project_id
                AND owner_pm.role_code = 1
              ORDER BY owner_pm.project_member_id ASC
              LIMIT 1
            )
            LEFT JOIN requirement_documents rd ON rd.project_id = p.project_id
            LEFT JOIN requirement_versions latest_rv ON latest_rv.requirement_document_id = rd.requirement_document_id
             AND latest_rv.version_number = (
               SELECT MAX(versioned_rv.version_number)
               FROM requirement_versions versioned_rv
               WHERE versioned_rv.requirement_document_id = rd.requirement_document_id
             )
            LEFT JOIN requirement_sections rs ON rs.requirement_version_id = latest_rv.requirement_version_id
            LEFT JOIN test_cases tc ON tc.project_id = p.project_id
            WHERE ${whereClause}
            GROUP BY p.project_id,
                     p.name,
                     p.status_code,
                     p.updated_at,
                     owner.user_id,
                     owner.name,
                     owner.role_code,
                     latest_rv.requirement_version_id,
                     latest_rv.version_number,
                     latest_rv.change_summary,
                     latest_rv.raw_markdown,
                     latest_rv.updated_at
            ORDER BY p.updated_at DESC, p.project_id DESC`;
  }

  private toProjectSummary(row: ProjectSummaryRow): DbProjectSummary {
    return {
      project_id: toNumber(row.project_id),
      name: row.name,
      status_code: row.status_code,
      owner: row.owner_user_id === null || row.owner_role_code === null || row.owner_name === null
        ? null
        : {
            user_id: toNumber(row.owner_user_id),
            name: row.owner_name,
            role: roleCodeToRole(row.owner_role_code),
          },
      members_summary: {
        total: toNumber(row.member_count),
        admins: toNumber(row.admin_count),
        pms: toNumber(row.pm_count),
        qas: toNumber(row.qa_count),
        developers: toNumber(row.developer_count),
      },
      latest_requirement_version: row.requirement_version_id === null || row.version_number === null
        ? null
        : {
            requirement_version_id: toNumber(row.requirement_version_id),
            version_number: row.version_number,
            change_summary: row.change_summary,
            raw_markdown: row.raw_markdown,
            updated_at: toIsoString(row.requirement_updated_at),
          },
      section_count: toNumber(row.section_count),
      test_case_count: toNumber(row.test_case_count),
      draft_count: toNumber(row.draft_count),
      published_count: toNumber(row.published_count),
      rejected_count: toNumber(row.rejected_count),
      updated_at: toIsoString(row.updated_at) ?? new Date(0).toISOString(),
    };
  }
}
