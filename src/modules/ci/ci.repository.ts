import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { ParsedJUnitTest } from './junit.parser';
import { MYSQL_POOL } from '../../infrastructure/db/mysql-pool';

export interface CiSettings {
  projectCiIntegrationId: number; projectId: number;
  repositoryOwner: string; repositoryName: string; defaultBranch: string;
  workflowId: number | null; workflowDisplayName: string | null; junitArtifactName: string; updatedAt: string | null;
}

@Injectable()
export class CiRepository {
  constructor(@Inject(MYSQL_POOL) private readonly pool: Pool) {}

  async getSettings(projectId: number): Promise<CiSettings | null> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(`SELECT i.project_ci_integration_id, i.project_id, i.repository_owner, i.repository_name, i.default_branch, i.workflow_id, i.workflow_display_name, i.junit_artifact_name, i.updated_at FROM project_ci_integrations i WHERE i.project_id = :projectId LIMIT 1`, { projectId });
    return rows[0] ? this.toSettings(rows[0]) : null;
  }

  async saveSettings(projectId: number, userId: number, input: { repositoryOwner: string; repositoryName: string; defaultBranch: string; workflowId: number; workflowIdentifier: string; workflowDisplayName?: string; junitArtifactName: string }): Promise<CiSettings> {
    await this.pool.execute(`INSERT INTO project_ci_integrations (project_id, repository_owner, repository_name, default_branch, workflow_identifier, workflow_id, workflow_display_name, junit_artifact_name, created_by_user_id)
      VALUES (:projectId, :repositoryOwner, :repositoryName, :defaultBranch, :workflowIdentifier, :workflowId, :workflowDisplayName, :junitArtifactName, :userId)
      ON DUPLICATE KEY UPDATE repository_owner = VALUES(repository_owner), repository_name = VALUES(repository_name), default_branch = VALUES(default_branch), workflow_identifier = VALUES(workflow_identifier), workflow_id = VALUES(workflow_id), workflow_display_name = VALUES(workflow_display_name), junit_artifact_name = VALUES(junit_artifact_name), updated_at = CURRENT_TIMESTAMP`, { projectId, userId, ...input });
    const saved = await this.getSettings(projectId);
    if (!saved) throw new NotFoundException(`CI settings could not be saved for project ${projectId}.`);
    return saved;
  }

  async upsertBinding(projectId: number, testCaseId: number, testIdentifier: string, userId: number) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [caseRows] = await connection.execute<RowDataPacket[]>('SELECT test_case_id FROM test_cases WHERE project_id = :projectId AND test_case_id = :testCaseId LIMIT 1 FOR UPDATE', { projectId, testCaseId });
      if (!caseRows[0]) throw new NotFoundException(`Test case ${testCaseId} was not found for project ${projectId}.`);
      const [identifierRows] = await connection.execute<RowDataPacket[]>('SELECT test_case_id FROM automated_test_bindings WHERE project_id = :projectId AND test_identifier = :testIdentifier LIMIT 1 FOR UPDATE', { projectId, testIdentifier });
      if (identifierRows[0] && Number(identifierRows[0].test_case_id) !== testCaseId) {
        throw new ConflictException(`Automated test identifier ${testIdentifier} is already bound to another Test Case.`);
      }
      await connection.execute(`INSERT INTO automated_test_bindings (project_id, test_case_id, test_identifier, created_by_user_id) VALUES (:projectId, :testCaseId, :testIdentifier, :userId)
        ON DUPLICATE KEY UPDATE test_identifier = VALUES(test_identifier), created_by_user_id = VALUES(created_by_user_id), updated_at = CURRENT_TIMESTAMP`, { projectId, testCaseId, testIdentifier, userId });
      const [bindingRows] = await connection.execute<RowDataPacket[]>('SELECT automated_test_binding_id FROM automated_test_bindings WHERE project_id = :projectId AND test_case_id = :testCaseId LIMIT 1 FOR UPDATE', { projectId, testCaseId });
      await this.recomputeVerificationEvidence(connection, projectId, testCaseId, Number(bindingRows[0].automated_test_binding_id), testIdentifier);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    return this.getBinding(projectId, testCaseId);
  }

  async getBinding(projectId: number, testCaseId: number) {
    const [rows] = await this.pool.execute<RowDataPacket[]>('SELECT automated_test_binding_id, test_case_id, test_identifier, created_at, updated_at FROM automated_test_bindings WHERE project_id = :projectId AND test_case_id = :testCaseId LIMIT 1', { projectId, testCaseId });
    return rows[0] ? this.camel(rows[0]) : null;
  }

  async deleteBinding(projectId: number, testCaseId: number): Promise<void> {
    await this.pool.execute('DELETE FROM automated_test_bindings WHERE project_id = :projectId AND test_case_id = :testCaseId', { projectId, testCaseId });
  }

  async listRuns(projectId: number) {
    const [rows] = await this.pool.execute<RowDataPacket[]>(`SELECT r.ci_run_id, r.github_run_id, r.github_run_attempt, r.workflow_identifier, r.workflow_id, r.branch_name, r.commit_sha, r.conclusion, r.within_verification_scope, r.eligible_for_evidence, r.ingestion_status, r.started_at, r.completed_at, r.ingested_at, r.error_message
      FROM ci_runs r INNER JOIN project_ci_integrations i ON i.project_ci_integration_id = r.project_ci_integration_id WHERE i.project_id = :projectId ORDER BY r.completed_at DESC, r.ci_run_id DESC`, { projectId });
    return rows.map((row) => this.camel(row));
  }

  async listTestResults(projectId: number, ciRunId: number) {
    const [rows] = await this.pool.execute<RowDataPacket[]>(`SELECT result.ci_test_result_id, result.test_identifier, result.suite_name, result.test_name, result.outcome, result.duration_ms, result.failure_message
      FROM ci_test_results result
      INNER JOIN ci_runs run ON run.ci_run_id = result.ci_run_id
      INNER JOIN project_ci_integrations integration ON integration.project_ci_integration_id = run.project_ci_integration_id
      WHERE integration.project_id = :projectId AND result.ci_run_id = :ciRunId AND result.test_identifier IS NOT NULL
      ORDER BY result.ci_test_result_id ASC`, { projectId, ciRunId });
    return rows.map((row) => this.camel(row));
  }

  async recordWorkflowRun(settings: CiSettings, run: { id: number; attempt: number; workflowId: number; workflow: string; branch: string; sha: string; conclusion: string | null; startedAt?: string | null; completedAt?: string | null }) {
    const [existing] = await this.pool.execute<RowDataPacket[]>('SELECT ci_run_id, ingestion_status FROM ci_runs WHERE project_ci_integration_id = :integrationId AND github_run_id = :runId AND github_run_attempt = :attempt LIMIT 1', { integrationId: settings.projectCiIntegrationId, runId: run.id, attempt: run.attempt });
    if (existing[0]?.ingestion_status === 'ingested') return false;
    const withinScope = run.branch === settings.defaultBranch && run.workflowId === settings.workflowId;
    const eligibleForEvidence = withinScope && run.conclusion === 'success';
    const startedAt = this.toMysqlUtcDateTime(run.startedAt);
    const completedAt = this.toMysqlUtcDateTime(run.completedAt);
    await this.pool.execute(`INSERT INTO ci_runs (project_ci_integration_id, github_run_id, github_run_attempt, workflow_identifier, workflow_id, branch_name, commit_sha, conclusion, within_verification_scope, eligible_for_evidence, ingestion_status, started_at, completed_at)
      VALUES (:integrationId, :runId, :attempt, :workflow, :workflowId, :branch, :sha, :conclusion, :withinScope, :eligibleForEvidence, 'pending_artifact', :startedAt, :completedAt)
      ON DUPLICATE KEY UPDATE workflow_identifier = VALUES(workflow_identifier), workflow_id = VALUES(workflow_id), branch_name = VALUES(branch_name), commit_sha = VALUES(commit_sha), conclusion = VALUES(conclusion), within_verification_scope = VALUES(within_verification_scope), eligible_for_evidence = VALUES(eligible_for_evidence), ingestion_status = 'pending_artifact', started_at = VALUES(started_at), completed_at = VALUES(completed_at), error_message = NULL`, { integrationId: settings.projectCiIntegrationId, runId: run.id, attempt: run.attempt, workflow: run.workflow, workflowId: run.workflowId, branch: run.branch, sha: run.sha, conclusion: run.conclusion, withinScope, eligibleForEvidence, startedAt, completedAt });
    return true;
  }

  async ingestJUnit(settings: CiSettings, runId: number, attempt: number, tests: ParsedJUnitTest[]): Promise<void> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [runRows] = await connection.execute<RowDataPacket[]>('SELECT ci_run_id, eligible_for_evidence FROM ci_runs WHERE project_ci_integration_id = :integrationId AND github_run_id = :runId AND github_run_attempt = :attempt FOR UPDATE', { integrationId: settings.projectCiIntegrationId, runId, attempt });
      if (!runRows[0]) throw new NotFoundException(`CI run ${runId}/${attempt} was not recorded.`);
      const ciRunId = Number(runRows[0].ci_run_id); const eligible = Boolean(runRows[0].eligible_for_evidence);
      await connection.execute('DELETE FROM ci_run_warnings WHERE ci_run_id = :ciRunId', { ciRunId });
      await connection.execute('DELETE FROM ci_test_results WHERE ci_run_id = :ciRunId', { ciRunId });
      const seenIdentifiers = new Set<string>();
      for (const test of tests) {
        const [insert] = await connection.execute<ResultSetHeader>(`INSERT INTO ci_test_results (ci_run_id, test_identifier, suite_name, test_name, outcome, duration_ms, failure_message) VALUES (:ciRunId, :identifier, :suiteName, :testName, :outcome, :durationMs, :failureMessage)`, { ciRunId, identifier: test.identifier, suiteName: test.suiteName, testName: test.testName, outcome: test.outcome, durationMs: test.durationMs, failureMessage: test.failureMessage });
        if (!test.identifier) { await connection.execute('INSERT INTO ci_run_warnings (ci_run_id, warning_code, message) VALUES (:ciRunId, :warningCode, :message)', { ciRunId, warningCode: 'UNMATCHED_TEST', message: `JUnit test ${test.testName} has no valid TC identifier.` }); continue; }
        if (seenIdentifiers.has(test.identifier)) { await connection.execute('INSERT INTO ci_run_warnings (ci_run_id, warning_code, message) VALUES (:ciRunId, :warningCode, :message)', { ciRunId, warningCode: 'DUPLICATE_IDENTIFIER', message: `JUnit identifier ${test.identifier} appeared more than once.` }); continue; }
        seenIdentifiers.add(test.identifier);
        if (!eligible || test.outcome !== 'passed') continue;
        const [bindingRows] = await connection.execute<RowDataPacket[]>(`SELECT binding.automated_test_binding_id, binding.test_case_id, test_case.published_test_case_version_id FROM automated_test_bindings binding INNER JOIN test_cases test_case ON test_case.test_case_id = binding.test_case_id WHERE binding.project_id = :projectId AND binding.test_identifier = :identifier AND test_case.published_test_case_version_id IS NOT NULL LIMIT 1`, { projectId: settings.projectId, identifier: test.identifier });
        const binding = bindingRows[0];
        if (!binding) { await connection.execute('INSERT INTO ci_run_warnings (ci_run_id, warning_code, message) VALUES (:ciRunId, :warningCode, :message)', { ciRunId, warningCode: 'UNBOUND_IDENTIFIER', message: `JUnit identifier ${test.identifier} is not bound to a published Test Case.` }); continue; }
        await connection.execute('UPDATE verification_evidence SET is_current = FALSE WHERE test_case_id = :testCaseId AND is_current = TRUE', { testCaseId: binding.test_case_id });
        await connection.execute(`INSERT INTO verification_evidence (test_case_id, published_test_case_version_id, automated_test_binding_id, ci_test_result_id, is_current) VALUES (:testCaseId, :versionId, :bindingId, :resultId, TRUE)`, { testCaseId: binding.test_case_id, versionId: binding.published_test_case_version_id, bindingId: binding.automated_test_binding_id, resultId: insert.insertId });
      }
      await connection.execute(`UPDATE ci_runs SET ingestion_status = 'ingested', ingested_at = CURRENT_TIMESTAMP, error_message = NULL WHERE ci_run_id = :ciRunId`, { ciRunId });
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally { connection.release(); }
  }

  async markIngestionFailed(settings: CiSettings, runId: number, attempt: number, message: string): Promise<void> {
    await this.pool.execute(`UPDATE ci_runs SET ingestion_status = 'failed', error_message = :message, ingested_at = CURRENT_TIMESTAMP WHERE project_ci_integration_id = :integrationId AND github_run_id = :runId AND github_run_attempt = :attempt`, { integrationId: settings.projectCiIntegrationId, runId, attempt, message: message.slice(0, 2000) });
  }

  private toSettings(row: RowDataPacket): CiSettings {
    return { projectCiIntegrationId: Number(row.project_ci_integration_id), projectId: Number(row.project_id), repositoryOwner: row.repository_owner, repositoryName: row.repository_name, defaultBranch: row.default_branch, workflowId: row.workflow_id === null ? null : Number(row.workflow_id), workflowDisplayName: row.workflow_display_name, junitArtifactName: row.junit_artifact_name, updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null };
  }

  private async recomputeVerificationEvidence(connection: PoolConnection, projectId: number, testCaseId: number, bindingId: number, testIdentifier: string): Promise<void> {
    await connection.execute('UPDATE verification_evidence SET is_current = FALSE WHERE test_case_id = :testCaseId AND is_current = TRUE', { testCaseId });
    const [caseRows] = await connection.execute<RowDataPacket[]>('SELECT published_test_case_version_id FROM test_cases WHERE project_id = :projectId AND test_case_id = :testCaseId LIMIT 1 FOR UPDATE', { projectId, testCaseId });
    const publishedVersionId = caseRows[0]?.published_test_case_version_id;
    if (publishedVersionId === null || publishedVersionId === undefined) return;
    const [resultRows] = await connection.execute<RowDataPacket[]>(`SELECT result.ci_test_result_id
      FROM ci_test_results result
      INNER JOIN ci_runs run ON run.ci_run_id = result.ci_run_id
      INNER JOIN project_ci_integrations integration ON integration.project_ci_integration_id = run.project_ci_integration_id
      WHERE integration.project_id = :projectId
        AND result.test_identifier = :testIdentifier
        AND result.outcome = 'passed'
        AND run.within_verification_scope = TRUE
        AND run.eligible_for_evidence = TRUE
        AND run.ingestion_status = 'ingested'
      ORDER BY run.completed_at DESC, run.ci_run_id DESC, result.ci_test_result_id DESC
      LIMIT 1`, { projectId, testIdentifier });
    if (!resultRows[0]) return;
    await connection.execute(`INSERT INTO verification_evidence (test_case_id, published_test_case_version_id, automated_test_binding_id, ci_test_result_id, is_current)
      VALUES (:testCaseId, :publishedVersionId, :bindingId, :resultId, TRUE)
      ON DUPLICATE KEY UPDATE test_case_id = VALUES(test_case_id), published_test_case_version_id = VALUES(published_test_case_version_id), automated_test_binding_id = VALUES(automated_test_binding_id), is_current = TRUE`, { testCaseId, publishedVersionId, bindingId, resultId: resultRows[0].ci_test_result_id });
  }

  private toMysqlUtcDateTime(value?: string | null): string | null {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new Error(`Invalid GitHub timestamp: ${value}`);
    return date.toISOString().slice(0, 19).replace('T', ' ');
  }

  private camel(row: RowDataPacket) {
    return Object.fromEntries(Object.entries(row).map(([key, value]) => [key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()), value instanceof Date ? value.toISOString() : value]));
  }
}
