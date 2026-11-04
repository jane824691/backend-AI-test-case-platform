import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { ParsedJUnitTest } from './junit.parser';
import { MYSQL_POOL } from '../../infrastructure/db/mysql-pool';

export interface CiSettings {
  projectCiIntegrationId: number; projectId: number; githubInstallationId: number;
  repositoryOwner: string; repositoryName: string; defaultBranch: string;
  workflowIdentifier: string; junitArtifactName: string; updatedAt: string | null;
}

@Injectable()
export class CiRepository {
  constructor(@Inject(MYSQL_POOL) private readonly pool: Pool) {}

  async getSettings(projectId: number): Promise<CiSettings | null> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(`SELECT project_ci_integration_id, project_id, github_installation_id, repository_owner, repository_name, default_branch, workflow_identifier, junit_artifact_name, updated_at FROM project_ci_integrations WHERE project_id = :projectId LIMIT 1`, { projectId });
    return rows[0] ? this.toSettings(rows[0]) : null;
  }

  async saveSettings(projectId: number, userId: number, input: Omit<CiSettings, 'projectCiIntegrationId' | 'projectId' | 'updatedAt'>): Promise<CiSettings> {
    await this.pool.execute(`INSERT INTO project_ci_integrations (project_id, github_installation_id, repository_owner, repository_name, default_branch, workflow_identifier, junit_artifact_name, created_by_user_id)
      VALUES (:projectId, :githubInstallationId, :repositoryOwner, :repositoryName, :defaultBranch, :workflowIdentifier, :junitArtifactName, :userId)
      ON DUPLICATE KEY UPDATE github_installation_id = VALUES(github_installation_id), repository_owner = VALUES(repository_owner), repository_name = VALUES(repository_name), default_branch = VALUES(default_branch), workflow_identifier = VALUES(workflow_identifier), junit_artifact_name = VALUES(junit_artifact_name), updated_at = CURRENT_TIMESTAMP`, { projectId, userId, ...input });
    const saved = await this.getSettings(projectId);
    if (!saved) throw new NotFoundException(`CI settings could not be saved for project ${projectId}.`);
    return saved;
  }

  async upsertBinding(projectId: number, testCaseId: number, testIdentifier: string, userId: number) {
    const [caseRows] = await this.pool.execute<RowDataPacket[]>('SELECT test_case_id FROM test_cases WHERE project_id = :projectId AND test_case_id = :testCaseId LIMIT 1', { projectId, testCaseId });
    if (!caseRows[0]) throw new NotFoundException(`Test case ${testCaseId} was not found for project ${projectId}.`);
    const [identifierRows] = await this.pool.execute<RowDataPacket[]>('SELECT test_case_id FROM automated_test_bindings WHERE project_id = :projectId AND test_identifier = :testIdentifier LIMIT 1', { projectId, testIdentifier });
    if (identifierRows[0] && Number(identifierRows[0].test_case_id) !== testCaseId) {
      throw new ConflictException(`Automated test identifier ${testIdentifier} is already bound to another Test Case.`);
    }
    await this.pool.execute(`INSERT INTO automated_test_bindings (project_id, test_case_id, test_identifier, created_by_user_id) VALUES (:projectId, :testCaseId, :testIdentifier, :userId)
      ON DUPLICATE KEY UPDATE test_identifier = VALUES(test_identifier), created_by_user_id = VALUES(created_by_user_id), updated_at = CURRENT_TIMESTAMP`, { projectId, testCaseId, testIdentifier, userId });
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
    const [rows] = await this.pool.execute<RowDataPacket[]>(`SELECT r.ci_run_id, r.github_run_id, r.github_run_attempt, r.workflow_identifier, r.branch_name, r.commit_sha, r.conclusion, r.eligible_for_verification, r.ingestion_status, r.started_at, r.completed_at, r.ingested_at, r.error_message
      FROM ci_runs r INNER JOIN project_ci_integrations i ON i.project_ci_integration_id = r.project_ci_integration_id WHERE i.project_id = :projectId ORDER BY r.completed_at DESC, r.ci_run_id DESC`, { projectId });
    return rows.map((row) => this.camel(row));
  }

  async findIntegrationByRepository(owner: string, name: string): Promise<CiSettings | null> {
    const [rows] = await this.pool.execute<RowDataPacket[]>('SELECT project_ci_integration_id, project_id, github_installation_id, repository_owner, repository_name, default_branch, workflow_identifier, junit_artifact_name, updated_at FROM project_ci_integrations WHERE repository_owner = :owner AND repository_name = :name LIMIT 1', { owner, name });
    return rows[0] ? this.toSettings(rows[0]) : null;
  }

  async recordWorkflowRun(settings: CiSettings, run: { id: number; attempt: number; workflow: string; branch: string; sha: string; conclusion: string | null; startedAt?: string; completedAt?: string }) {
    const eligible = run.branch === settings.defaultBranch && run.workflow === settings.workflowIdentifier && run.conclusion === 'success';
    await this.pool.execute(`INSERT INTO ci_runs (project_ci_integration_id, github_run_id, github_run_attempt, workflow_identifier, branch_name, commit_sha, conclusion, eligible_for_verification, ingestion_status, started_at, completed_at)
      VALUES (:integrationId, :runId, :attempt, :workflow, :branch, :sha, :conclusion, :eligible, 'pending_artifact', :startedAt, :completedAt)
      ON DUPLICATE KEY UPDATE conclusion = VALUES(conclusion), eligible_for_verification = VALUES(eligible_for_verification), ingestion_status = VALUES(ingestion_status), started_at = VALUES(started_at), completed_at = VALUES(completed_at)`, { integrationId: settings.projectCiIntegrationId, runId: run.id, attempt: run.attempt, workflow: run.workflow, branch: run.branch, sha: run.sha, conclusion: run.conclusion, eligible, startedAt: run.startedAt ?? null, completedAt: run.completedAt ?? null });
  }

  async ingestJUnit(settings: CiSettings, runId: number, attempt: number, tests: ParsedJUnitTest[]): Promise<void> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [runRows] = await connection.execute<RowDataPacket[]>('SELECT ci_run_id, eligible_for_verification FROM ci_runs WHERE project_ci_integration_id = :integrationId AND github_run_id = :runId AND github_run_attempt = :attempt FOR UPDATE', { integrationId: settings.projectCiIntegrationId, runId, attempt });
      if (!runRows[0]) throw new NotFoundException(`CI run ${runId}/${attempt} was not recorded.`);
      const ciRunId = Number(runRows[0].ci_run_id); const eligible = Boolean(runRows[0].eligible_for_verification);
      await connection.execute(`DELETE evidence FROM verification_evidence evidence INNER JOIN ci_test_results result ON result.ci_test_result_id = evidence.ci_test_result_id WHERE result.ci_run_id = :ciRunId`, { ciRunId });
      await connection.execute('DELETE FROM ci_test_results WHERE ci_run_id = :ciRunId', { ciRunId });
      if (eligible) await connection.execute(`UPDATE verification_evidence evidence INNER JOIN automated_test_bindings binding ON binding.automated_test_binding_id = evidence.automated_test_binding_id SET evidence.is_current = FALSE WHERE binding.project_id = :projectId AND evidence.is_current = TRUE`, { projectId: settings.projectId });
      for (const test of tests) {
        const [insert] = await connection.execute<ResultSetHeader>(`INSERT INTO ci_test_results (ci_run_id, test_identifier, suite_name, test_name, outcome, duration_ms, failure_message) VALUES (:ciRunId, :identifier, :suiteName, :testName, :outcome, :durationMs, :failureMessage)`, { ciRunId, identifier: test.identifier, suiteName: test.suiteName, testName: test.testName, outcome: test.outcome, durationMs: test.durationMs, failureMessage: test.failureMessage });
        if (!eligible || test.outcome !== 'passed' || !test.identifier) continue;
        const [bindingRows] = await connection.execute<RowDataPacket[]>(`SELECT binding.automated_test_binding_id, binding.test_case_id, test_case.published_test_case_version_id FROM automated_test_bindings binding INNER JOIN test_cases test_case ON test_case.test_case_id = binding.test_case_id WHERE binding.project_id = :projectId AND binding.test_identifier = :identifier AND test_case.published_test_case_version_id IS NOT NULL LIMIT 1`, { projectId: settings.projectId, identifier: test.identifier });
        const binding = bindingRows[0];
        if (!binding) continue;
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
    return { projectCiIntegrationId: Number(row.project_ci_integration_id), projectId: Number(row.project_id), githubInstallationId: Number(row.github_installation_id), repositoryOwner: row.repository_owner, repositoryName: row.repository_name, defaultBranch: row.default_branch, workflowIdentifier: row.workflow_identifier, junitArtifactName: row.junit_artifact_name, updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null };
  }

  private camel(row: RowDataPacket) {
    return Object.fromEntries(Object.entries(row).map(([key, value]) => [key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()), value instanceof Date ? value.toISOString() : value]));
  }
}
