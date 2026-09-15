import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { PassFailResult, TestCaseStatus } from '../../../common/domain/test-case';
import { MYSQL_POOL } from '../mysql-pool';
import { toIsoString, toNumber } from './row-utils';

interface TestCaseSummaryRow extends RowDataPacket {
  test_case_id: number | string;
  project_id: number | string;
  requirement_section_id: number | string | null;
  section_key: string | null;
  stable_case_code: string;
  current_status_code: number;
  current_test_case_version_id: number | string | null;
  published_test_case_version_id: number | string | null;
  updated_by_user_id: number | string | null;
  updated_by_user_name: string | null;
  updated_at: Date | string | null;
  pass_fail_result_code: number | null;
  pass_fail_updated_by_user_id: number | string | null;
  pass_fail_updated_by_name: string | null;
  test_case_version_id: number | string | null;
  revision_number: number | null;
  published_revision_number: number | null;
  title: string | null;
  priority_code: number | null;
  suggested_test_level_code: number | null;
}

interface TestCaseDetailRow extends TestCaseSummaryRow {
  description: string | null;
  preconditions: string | null;
  expected_result: string | null;
  reusability_note: string | null;
  unit_test_recommended: number | boolean | null;
  generated_by_ai: number | boolean | null;
  version_updated_by_user_id: number | string | null;
  version_updated_by_user_name: string | null;
  version_updated_at: Date | string | null;
}

interface NextRevisionRow extends RowDataPacket {
  next_revision_number: number | string;
}

export interface UpdateTestCaseVersionInput {
  requirementSectionId?: number | null;
  stableCaseCode?: string;
  title?: string;
  description?: string;
  preconditions?: string;
  expectedResult?: string;
  priority?: string;
  suggestedTestLevel?: string;
  reusabilityNote?: string;
  unitTestRecommended?: boolean;
}

export interface CreateAiDraftTestCaseInput {
  title: string;
  description: string;
  preconditions: string[];
  expectedResult: string;
  priority: string;
  suggestedTestLevel: string;
  reusabilityNote: string | null;
  unitTestRecommended: boolean;
}

export interface DbTestCaseSummary {
  test_case_id: number;
  project_id: number;
  requirement_section_id: number | null;
  section_key: string | null;
  stable_case_code: string;
  current_status: TestCaseStatus;
  current_test_case_version_id: number | null;
  published_test_case_version_id: number | null;
  updated_by_user_id: number | null;
  updated_by_user_name: string | null;
  updated_at: string | null;
  pass_fail_result: PassFailResult | null;
  pass_fail_updated_by_user_id: number | null;
  pass_fail_updated_by_name: string | null;
  latest_version: {
    test_case_version_id: number | null;
    revision_number: number | null;
    title: string | null;
    priority: string | null;
    suggested_test_level: string | null;
  };
  published_version: {
    test_case_version_id: number | null;
    revision_number: number | null;
  };
}

export interface DbTestCaseDetail extends DbTestCaseSummary {
  latest_version: DbTestCaseSummary['latest_version'] & {
    description: string | null;
    preconditions: string | null;
    expected_result: string | null;
    reusability_note: string | null;
    unit_test_recommended: boolean;
    generated_by_ai: boolean;
    updated_by_user_id: number | null;
    updated_by_user_name: string | null;
    updated_at: string | null;
  };
}

@Injectable()
export class TestCaseRepository {
  constructor(@Inject(MYSQL_POOL) private readonly pool: Pool) {}

  async listByProject(projectId: number): Promise<DbTestCaseSummary[]> {
    const [rows] = await this.pool.execute<TestCaseSummaryRow[]>(this.summaryQuery('tc.project_id = :projectId'), {
      projectId,
    });
    return rows.map((row) => this.toSummary(row));
  }

  async listBySection(projectId: number, sectionId: number): Promise<DbTestCaseSummary[]> {
    await this.assertSectionBelongsToProject(projectId, sectionId);
    const [rows] = await this.pool.execute<TestCaseSummaryRow[]>(
      this.summaryQuery('tc.project_id = :projectId AND tcv.requirement_section_id = :sectionId'),
      { projectId, sectionId },
    );
    return rows.map((row) => this.toSummary(row));
  }

  async findDetail(projectId: number, testCaseId: number): Promise<DbTestCaseDetail | undefined> {
    const [rows] = await this.pool.execute<TestCaseDetailRow[]>(
      `SELECT tc.test_case_id,
              tc.project_id,
              tc.stable_case_code,
              tc.current_status_code,
              tc.current_test_case_version_id,
              tc.published_test_case_version_id,
              tc.updated_by_user_id,
              updater.name AS updated_by_user_name,
              tc.updated_at,
              tc.pass_fail_result_code,
              tc.pass_fail_updated_by_user_id,
              result_updater.name AS pass_fail_updated_by_name,
              tcv.test_case_version_id,
              tcv.requirement_section_id,
              rs.section_key,
              tcv.revision_number,
              published_tcv.revision_number AS published_revision_number,
              tcv.title,
              tcv.description,
              tcv.preconditions,
              tcv.expected_result,
              tcv.priority_code,
              tcv.suggested_test_level_code,
              tcv.reusability_note,
              tcv.unit_test_recommended,
              tcv.generated_by_ai,
              tcv.updated_by_user_id AS version_updated_by_user_id,
              version_updater.name AS version_updated_by_user_name,
              tcv.updated_at AS version_updated_at
       FROM test_cases tc
       LEFT JOIN test_case_versions tcv ON tcv.test_case_version_id = tc.current_test_case_version_id
       LEFT JOIN test_case_versions published_tcv ON published_tcv.test_case_version_id = tc.published_test_case_version_id
       LEFT JOIN requirement_sections rs ON rs.requirement_section_id = tcv.requirement_section_id
       LEFT JOIN users updater ON updater.user_id = tc.updated_by_user_id
       LEFT JOIN users result_updater ON result_updater.user_id = tc.pass_fail_updated_by_user_id
       LEFT JOIN users version_updater ON version_updater.user_id = tcv.updated_by_user_id
       WHERE tc.project_id = :projectId
         AND tc.test_case_id = :testCaseId
       LIMIT 1`,
      { projectId, testCaseId },
    );
    return rows[0] ? this.toDetail(rows[0]) : undefined;
  }

  async createEditedVersion(
    projectId: number,
    testCaseId: number,
    input: UpdateTestCaseVersionInput,
    userId: number,
  ): Promise<DbTestCaseDetail> {
    const current = await this.findDetail(projectId, testCaseId);
    if (!current) throw new NotFoundException(`Test case ${testCaseId} was not found for project ${projectId}.`);
    if (current.latest_version.test_case_version_id === null) {
      throw new BadRequestException('Test case has no current version to edit.');
    }
    const requirementSectionId = input.requirementSectionId ?? current.requirement_section_id;
    if (requirementSectionId === null) {
      throw new BadRequestException('A requirement section is required to edit a test case.');
    }
    await this.assertSectionBelongsToProject(projectId, requirementSectionId);

    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(
        `SELECT test_case_id
         FROM test_cases
         WHERE project_id = :projectId
           AND test_case_id = :testCaseId
         FOR UPDATE`,
        { projectId, testCaseId },
      );
      const [revisionRows] = await connection.execute<NextRevisionRow[]>(
        `SELECT COALESCE(MAX(revision_number), 0) + 1 AS next_revision_number
         FROM test_case_versions
         WHERE test_case_id = :testCaseId`,
        { testCaseId },
      );
      const nextRevisionNumber = toNumber(revisionRows[0].next_revision_number);

      const [insertResult] = await connection.execute<ResultSetHeader>(
        `INSERT INTO test_case_versions (
           test_case_id,
           requirement_section_id,
           title,
           description,
           preconditions,
           expected_result,
           priority_code,
           suggested_test_level_code,
           reusability_note,
           unit_test_recommended,
           generated_by_ai,
           revision_number,
           updated_by_user_id,
           updated_at
         )
         VALUES (
           :testCaseId,
           :requirementSectionId,
           :title,
           :description,
           :preconditions,
           :expectedResult,
           :priorityCode,
           :suggestedTestLevelCode,
           :reusabilityNote,
           :unitTestRecommended,
           :generatedByAi,
           :revisionNumber,
           :updatedByUserId,
           CURRENT_TIMESTAMP
         )`,
        {
          testCaseId,
          requirementSectionId,
          title: input.title ?? current.latest_version.title ?? 'Untitled test case',
          description: input.description ?? current.latest_version.description ?? '',
          preconditions: input.preconditions ?? current.latest_version.preconditions,
          expectedResult: input.expectedResult ?? current.latest_version.expected_result ?? '',
          priorityCode: this.priorityLabelToCode(input.priority ?? current.latest_version.priority),
          suggestedTestLevelCode: this.suggestedLevelLabelToCode(
            input.suggestedTestLevel ?? current.latest_version.suggested_test_level,
          ),
          reusabilityNote: input.reusabilityNote ?? current.latest_version.reusability_note,
          unitTestRecommended: input.unitTestRecommended ?? current.latest_version.unit_test_recommended,
          generatedByAi: current.latest_version.generated_by_ai,
          revisionNumber: nextRevisionNumber,
          updatedByUserId: userId,
        },
      );

      await connection.execute(
        `UPDATE test_cases
         SET current_test_case_version_id = :testCaseVersionId,
             current_status_code = :draftStatusCode,
             updated_by_user_id = :updatedByUserId,
             updated_at = CURRENT_TIMESTAMP
         WHERE project_id = :projectId
           AND test_case_id = :testCaseId`,
        {
          testCaseVersionId: insertResult.insertId,
          draftStatusCode: this.statusLabelToCode(TestCaseStatus.Draft),
          updatedByUserId: userId,
          projectId,
          testCaseId,
        },
      );

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    return this.requireDetail(projectId, testCaseId);
  }

  async publish(projectId: number, testCaseId: number, userId: number): Promise<DbTestCaseDetail> {
    const current = await this.findDetail(projectId, testCaseId);
    if (!current) throw new NotFoundException(`Test case ${testCaseId} was not found for project ${projectId}.`);
    if (current.current_test_case_version_id === null) {
      throw new BadRequestException('Test case has no current version to publish.');
    }

    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(
        `UPDATE test_cases
         SET current_status_code = :publishedStatusCode,
             published_test_case_version_id = :currentVersionId,
             updated_by_user_id = :updatedByUserId,
             updated_at = CURRENT_TIMESTAMP
         WHERE project_id = :projectId
           AND test_case_id = :testCaseId`,
        {
          publishedStatusCode: this.statusLabelToCode(TestCaseStatus.Published),
          currentVersionId: current.current_test_case_version_id,
          updatedByUserId: userId,
          projectId,
          testCaseId,
        },
      );
      await this.insertReviewRecord(connection, current.current_test_case_version_id, userId, 1, 'Published by API.');
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    return this.requireDetail(projectId, testCaseId);
  }

  async reopen(projectId: number, testCaseId: number, userId: number): Promise<DbTestCaseDetail> {
    const current = await this.findDetail(projectId, testCaseId);
    if (!current) throw new NotFoundException(`Test case ${testCaseId} was not found for project ${projectId}.`);
    if (current.current_test_case_version_id === null) {
      throw new BadRequestException('Test case has no current version to reopen.');
    }

    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(
        `UPDATE test_cases
         SET current_status_code = :draftStatusCode,
             updated_by_user_id = :updatedByUserId,
             updated_at = CURRENT_TIMESTAMP
         WHERE project_id = :projectId
           AND test_case_id = :testCaseId`,
        {
          draftStatusCode: this.statusLabelToCode(TestCaseStatus.Draft),
          updatedByUserId: userId,
          projectId,
          testCaseId,
        },
      );
      await this.insertReviewRecord(connection, current.current_test_case_version_id, userId, 2, 'Reopened to draft by API.');
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    return this.requireDetail(projectId, testCaseId);
  }

  async delete(projectId: number, testCaseId: number): Promise<void> {
    const current = await this.findDetail(projectId, testCaseId);
    if (!current) throw new NotFoundException(`Test case ${testCaseId} was not found for project ${projectId}.`);

    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(
        `SELECT test_case_id
         FROM test_cases
         WHERE project_id = :projectId
           AND test_case_id = :testCaseId
         FOR UPDATE`,
        { projectId, testCaseId },
      );

      await connection.execute(
        `DELETE rr
         FROM review_records rr
         INNER JOIN test_case_versions tcv ON tcv.test_case_version_id = rr.test_case_version_id
         WHERE tcv.test_case_id = :testCaseId`,
        { testCaseId },
      );

      await connection.execute(
        `UPDATE test_cases
         SET current_test_case_version_id = NULL,
             published_test_case_version_id = NULL
         WHERE project_id = :projectId
           AND test_case_id = :testCaseId`,
        { projectId, testCaseId },
      );

      await connection.execute(
        `DELETE FROM test_case_versions
         WHERE test_case_id = :testCaseId`,
        { testCaseId },
      );

      await connection.execute(
        `DELETE FROM test_cases
         WHERE project_id = :projectId
           AND test_case_id = :testCaseId`,
        { projectId, testCaseId },
      );

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async updateResult(
    projectId: number,
    testCaseId: number,
    result: PassFailResult,
    userId: number,
  ): Promise<DbTestCaseDetail> {
    const resultCode = this.passFailLabelToCode(result);
    const [updateResult] = await this.pool.execute<ResultSetHeader>(
      `UPDATE test_cases
       SET pass_fail_result_code = :resultCode,
           pass_fail_updated_by_user_id = :updatedByUserId,
           updated_at = CURRENT_TIMESTAMP
       WHERE project_id = :projectId
         AND test_case_id = :testCaseId`,
      { resultCode, updatedByUserId: userId, projectId, testCaseId },
    );
    if (updateResult.affectedRows === 0) {
      throw new NotFoundException(`Test case ${testCaseId} was not found for project ${projectId}.`);
    }
    return this.requireDetail(projectId, testCaseId);
  }

  async createManualDraft(
    projectId: number,
    input: UpdateTestCaseVersionInput,
    userId: number,
  ): Promise<DbTestCaseDetail> {
    if (!input.requirementSectionId) {
      throw new BadRequestException('A requirement section is required to create a test case.');
    }
    await this.assertSectionBelongsToProject(projectId, input.requirementSectionId);

    const connection = await this.pool.getConnection();
    let testCaseId = 0;
    try {
      await connection.beginTransaction();
      const [caseResult] = await connection.execute<ResultSetHeader>(
        `INSERT INTO test_cases (
           project_id,
           stable_case_code,
           current_status_code,
           current_test_case_version_id,
           published_test_case_version_id,
           updated_by_user_id,
           updated_at
         )
         VALUES (
           :projectId,
           :stableCaseCode,
           :draftStatusCode,
           NULL,
           NULL,
           :updatedByUserId,
           CURRENT_TIMESTAMP
         )`,
        {
          projectId,
          stableCaseCode: input.stableCaseCode?.trim() || `TC-P${projectId}-MANUAL-${Date.now()}`,
          draftStatusCode: this.statusLabelToCode(TestCaseStatus.Draft),
          updatedByUserId: userId,
        },
      );
      testCaseId = caseResult.insertId;

      const [versionResult] = await connection.execute<ResultSetHeader>(
        `INSERT INTO test_case_versions (
           test_case_id,
           requirement_section_id,
           title,
           description,
           preconditions,
           expected_result,
           priority_code,
           suggested_test_level_code,
           reusability_note,
           unit_test_recommended,
           generated_by_ai,
           revision_number,
           updated_by_user_id,
           updated_at
         )
         VALUES (
           :testCaseId,
           :requirementSectionId,
           :title,
           :description,
           :preconditions,
           :expectedResult,
           :priorityCode,
           :suggestedTestLevelCode,
           :reusabilityNote,
           :unitTestRecommended,
           FALSE,
           1,
           :updatedByUserId,
           CURRENT_TIMESTAMP
         )`,
        {
          testCaseId,
          requirementSectionId: input.requirementSectionId,
          title: input.title ?? 'Untitled test case',
          description: input.description ?? '',
          preconditions: input.preconditions ?? null,
          expectedResult: input.expectedResult ?? '',
          priorityCode: this.priorityLabelToCode(input.priority ?? null),
          suggestedTestLevelCode: this.suggestedLevelLabelToCode(input.suggestedTestLevel ?? null),
          reusabilityNote: input.reusabilityNote ?? null,
          unitTestRecommended: input.unitTestRecommended ?? false,
          updatedByUserId: userId,
        },
      );

      await connection.execute(
        `UPDATE test_cases
         SET current_test_case_version_id = :testCaseVersionId
         WHERE test_case_id = :testCaseId
           AND project_id = :projectId`,
        {
          testCaseVersionId: versionResult.insertId,
          testCaseId,
          projectId,
        },
      );

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    return this.requireDetail(projectId, testCaseId);
  }

  async createAiGeneratedDrafts(
    projectId: number,
    requirementSectionId: number,
    draftInputs: CreateAiDraftTestCaseInput[],
  ): Promise<DbTestCaseDetail[]> {
    if (draftInputs.length === 0) return [];

    const createdIds: number[] = [];
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      for (const [index, draft] of draftInputs.entries()) {
        const stableCaseCode = `TC-P${projectId}-S${requirementSectionId}-C${index + 1}`;
        const [caseResult] = await connection.execute<ResultSetHeader>(
          `INSERT INTO test_cases (
             project_id,
             stable_case_code,
             current_status_code,
             current_test_case_version_id,
             published_test_case_version_id,
             updated_by_user_id,
             updated_at
           )
           VALUES (
             :projectId,
             :stableCaseCode,
             :draftStatusCode,
             NULL,
             NULL,
             NULL,
             NULL
           )`,
          {
            projectId,
            stableCaseCode,
            draftStatusCode: this.statusLabelToCode(TestCaseStatus.Draft),
          },
        );

        const testCaseId = caseResult.insertId;
        const [versionResult] = await connection.execute<ResultSetHeader>(
          `INSERT INTO test_case_versions (
             test_case_id,
             requirement_section_id,
             title,
             description,
             preconditions,
             expected_result,
             priority_code,
             suggested_test_level_code,
             reusability_note,
             unit_test_recommended,
             generated_by_ai,
             revision_number,
             updated_by_user_id,
             updated_at
           )
           VALUES (
             :testCaseId,
             :requirementSectionId,
             :title,
             :description,
             :preconditions,
             :expectedResult,
             :priorityCode,
             :suggestedTestLevelCode,
             :reusabilityNote,
             :unitTestRecommended,
             TRUE,
             1,
             NULL,
             NULL
           )`,
          {
            testCaseId,
            requirementSectionId,
            title: draft.title,
            description: draft.description,
            preconditions: draft.preconditions.length > 0 ? draft.preconditions.join('\n') : null,
            expectedResult: draft.expectedResult,
            priorityCode: this.priorityLabelToCode(draft.priority),
            suggestedTestLevelCode: this.suggestedLevelLabelToCode(draft.suggestedTestLevel),
            reusabilityNote: draft.reusabilityNote,
            unitTestRecommended: draft.unitTestRecommended,
          },
        );

        await connection.execute(
          `UPDATE test_cases
           SET current_test_case_version_id = :testCaseVersionId
           WHERE test_case_id = :testCaseId
             AND project_id = :projectId`,
          {
            testCaseVersionId: versionResult.insertId,
            testCaseId,
            projectId,
          },
        );
        createdIds.push(testCaseId);
      }

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    return Promise.all(createdIds.map((testCaseId) => this.requireDetail(projectId, testCaseId)));
  }

  private summaryQuery(whereClause: string): string {
    return `SELECT tc.test_case_id,
                   tc.project_id,
                   tcv.requirement_section_id,
                   rs.section_key,
                   tc.stable_case_code,
                   tc.current_status_code,
                   tc.current_test_case_version_id,
                   tc.published_test_case_version_id,
                   tc.updated_by_user_id,
                   updater.name AS updated_by_user_name,
                   tc.updated_at,
                   tc.pass_fail_result_code,
                   tc.pass_fail_updated_by_user_id,
                   result_updater.name AS pass_fail_updated_by_name,
                   tcv.test_case_version_id,
                   tcv.revision_number,
                   published_tcv.revision_number AS published_revision_number,
                   tcv.title,
                   tcv.priority_code,
                   tcv.suggested_test_level_code
            FROM test_cases tc
            LEFT JOIN test_case_versions tcv ON tcv.test_case_version_id = tc.current_test_case_version_id
            LEFT JOIN test_case_versions published_tcv ON published_tcv.test_case_version_id = tc.published_test_case_version_id
            LEFT JOIN requirement_sections rs ON rs.requirement_section_id = tcv.requirement_section_id
            LEFT JOIN users updater ON updater.user_id = tc.updated_by_user_id
            LEFT JOIN users result_updater ON result_updater.user_id = tc.pass_fail_updated_by_user_id
            WHERE ${whereClause}
            ORDER BY tc.updated_at DESC, tc.test_case_id DESC`;
  }

  private async assertSectionBelongsToProject(projectId: number, sectionId: number): Promise<void> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT rs.requirement_section_id
       FROM requirement_sections rs
       INNER JOIN requirement_versions rv ON rv.requirement_version_id = rs.requirement_version_id
       INNER JOIN requirement_documents rd ON rd.requirement_document_id = rv.requirement_document_id
       WHERE rd.project_id = :projectId
         AND rs.requirement_section_id = :sectionId
       LIMIT 1`,
      { projectId, sectionId },
    );
    if (!rows[0]) throw new NotFoundException(`Section ${sectionId} was not found for project ${projectId}.`);
  }

  private async requireDetail(projectId: number, testCaseId: number): Promise<DbTestCaseDetail> {
    const testCase = await this.findDetail(projectId, testCaseId);
    if (!testCase) throw new NotFoundException(`Test case ${testCaseId} was not found for project ${projectId}.`);
    return testCase;
  }

  private async insertReviewRecord(
    connection: PoolConnection,
    testCaseVersionId: number,
    reviewerUserId: number,
    actionCode: number,
    comment: string,
  ): Promise<void> {
    await connection.execute(
      `INSERT INTO review_records (test_case_version_id, reviewer_user_id, action_code, comment, updated_at)
       VALUES (:testCaseVersionId, :reviewerUserId, :actionCode, :comment, CURRENT_TIMESTAMP)`,
      { testCaseVersionId, reviewerUserId, actionCode, comment },
    );
  }

  private toSummary(row: TestCaseSummaryRow): DbTestCaseSummary {
    return {
      test_case_id: toNumber(row.test_case_id),
      project_id: toNumber(row.project_id),
      requirement_section_id: row.requirement_section_id === null ? null : toNumber(row.requirement_section_id),
      section_key: row.section_key,
      stable_case_code: row.stable_case_code,
      current_status: this.statusCodeToLabel(row.current_status_code),
      current_test_case_version_id:
        row.current_test_case_version_id === null ? null : toNumber(row.current_test_case_version_id),
      published_test_case_version_id:
        row.published_test_case_version_id === null ? null : toNumber(row.published_test_case_version_id),
      updated_by_user_id: row.updated_by_user_id === null ? null : toNumber(row.updated_by_user_id),
      updated_by_user_name: row.updated_by_user_name,
      updated_at: toIsoString(row.updated_at),
      pass_fail_result: this.passFailCodeToLabel(row.pass_fail_result_code),
      pass_fail_updated_by_user_id:
        row.pass_fail_updated_by_user_id === null ? null : toNumber(row.pass_fail_updated_by_user_id),
      pass_fail_updated_by_name: row.pass_fail_updated_by_name,
      latest_version: {
        test_case_version_id: row.test_case_version_id === null ? null : toNumber(row.test_case_version_id),
        revision_number: row.revision_number,
        title: row.title,
        priority: this.priorityCodeToLabel(row.priority_code),
        suggested_test_level: this.suggestedLevelCodeToLabel(row.suggested_test_level_code),
      },
      published_version: {
        test_case_version_id:
          row.published_test_case_version_id === null ? null : toNumber(row.published_test_case_version_id),
        revision_number: row.published_revision_number,
      },
    };
  }

  private toDetail(row: TestCaseDetailRow): DbTestCaseDetail {
    const summary = this.toSummary(row);
    return {
      ...summary,
      latest_version: {
        ...summary.latest_version,
        description: row.description,
        preconditions: row.preconditions,
        expected_result: row.expected_result,
        reusability_note: row.reusability_note,
        unit_test_recommended: Boolean(row.unit_test_recommended),
        generated_by_ai: Boolean(row.generated_by_ai),
        updated_by_user_id: row.version_updated_by_user_id === null ? null : toNumber(row.version_updated_by_user_id),
        updated_by_user_name: row.version_updated_by_user_name,
        updated_at: toIsoString(row.version_updated_at),
      },
    };
  }

  private statusCodeToLabel(code: number): TestCaseStatus {
    if (code === 1) return TestCaseStatus.Published;
    if (code === 2) return TestCaseStatus.Rejected;
    return TestCaseStatus.Draft;
  }

  private statusLabelToCode(status: TestCaseStatus): number {
    if (status === TestCaseStatus.Published) return 1;
    if (status === TestCaseStatus.Rejected) return 2;
    return 0;
  }

  private passFailCodeToLabel(code: number | null): PassFailResult | null {
    if (code === null) return null;
    if (code === 0) return PassFailResult.Pass;
    if (code === 1) return PassFailResult.Fail;
    return PassFailResult.Hold;
  }

  private passFailLabelToCode(result: PassFailResult): number {
    if (result === PassFailResult.Pass) return 0;
    if (result === PassFailResult.Fail) return 1;
    return 2;
  }

  private priorityCodeToLabel(code: number | null): string | null {
    if (code === null) return null;
    return ['p0', 'p1', 'p2', 'p3'][code] ?? `unknown:${code}`;
  }

  private priorityLabelToCode(priority: string | null): number {
    if (priority === 'high') return 1;
    if (priority === 'medium') return 2;
    if (priority === 'low') return 3;
    if (priority === 'p1') return 1;
    if (priority === 'p2') return 2;
    if (priority === 'p3') return 3;
    return 0;
  }

  private suggestedLevelCodeToLabel(code: number | null): string | null {
    if (code === null) return null;
    return ['unit', 'integration', 'e2e'][code] ?? `unknown:${code}`;
  }

  private suggestedLevelLabelToCode(level: string | null): number {
    if (level === 'integration') return 1;
    if (level === 'e2e') return 2;
    return 0;
  }

}
