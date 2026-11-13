import { BadRequestException, Injectable } from '@nestjs/common';
import { SessionUser } from '../../common/auth/session-user';
import { CiRepository } from './ci.repository';
import { UpdateAutomatedTestBindingDto, UpdateCiSettingsDto } from './dto/ci.dto';
import { GithubActionsPatClient } from './github-actions-pat.client';
import { parseJUnit } from './junit.parser';
import { parseJestJson } from './jest-json.parser';

@Injectable()
export class CiService {
  constructor(private readonly repository: CiRepository, private readonly github: GithubActionsPatClient) {}

  async getSettings(projectId: string) {
    return { data: await this.repository.getSettings(Number(projectId)) };
  }

  async updateSettings(projectId: string, input: UpdateCiSettingsDto, user: SessionUser) {
    await this.repository.saveSettings(Number(projectId), Number(user.userId), {
      repositoryOwner: input.repositoryOwner,
      repositoryName: input.repositoryName,
      defaultBranch: input.defaultBranch,
      workflowId: input.workflowId,
      workflowIdentifier: input.workflowDisplayName?.trim() || String(input.workflowId),
      workflowDisplayName: input.workflowDisplayName,
      junitArtifactName: input.junitArtifactName ?? 'ai-test-platform-junit',
    });
    return { data: await this.repository.getSettings(Number(projectId)) };
  }

  async listRuns(projectId: string) {
    const items = await this.repository.listRuns(Number(projectId));
    return { data: { projectId: Number(projectId), items, total: items.length } };
  }

  async listTestResults(projectId: string, ciRunId: string) {
    const items = await this.repository.listTestResults(Number(projectId), Number(ciRunId));
    return { data: { projectId: Number(projectId), ciRunId: Number(ciRunId), items, total: items.length } };
  }

  async upsertBinding(projectId: string, testCaseId: string, input: UpdateAutomatedTestBindingDto, user: SessionUser) {
    const data = await this.repository.upsertBinding(Number(projectId), Number(testCaseId), input.testIdentifier, Number(user.userId));
    return { data };
  }

  async deleteBinding(projectId: string, testCaseId: string) {
    await this.repository.deleteBinding(Number(projectId), Number(testCaseId));
    return { data: { projectId: Number(projectId), testCaseId: Number(testCaseId), deleted: true } };
  }

  async syncCompletedRuns(projectId: string) {
    const id = Number(projectId); const settings = await this.repository.getSettings(id);
    if (!settings?.workflowId) throw new BadRequestException('Configure a GitHub workflow before syncing.');
    const token = process.env.GITHUB_ACTIONS_PAT?.trim();
    if (!token) throw new BadRequestException('GITHUB_ACTIONS_PAT must be configured in the backend environment before syncing.');
    const runs = await this.github.listCompletedRuns(settings.repositoryOwner, settings.repositoryName, settings.workflowId, settings.defaultBranch, token);
    let synced = 0; let skipped = 0; let failed = 0;
    for (const run of runs) {
      const attempt = run.run_attempt || 1;
      const shouldIngest = await this.repository.recordWorkflowRun(settings, { id: run.id, attempt, workflowId: run.workflow_id, workflow: run.name ?? settings.workflowDisplayName ?? String(run.workflow_id), branch: run.head_branch ?? '', sha: run.head_sha ?? '', conclusion: run.conclusion, startedAt: run.run_started_at, completedAt: run.updated_at });
      if (!shouldIngest) { skipped += 1; continue; }
      try { const report = await this.github.downloadTestReport(settings.repositoryOwner, settings.repositoryName, run.id, settings.junitArtifactName, token); const tests = report.format === 'jest_json' ? parseJestJson(report.content) : parseJUnit(report.content); await this.repository.ingestJUnit(settings, run.id, attempt, tests); synced += 1; }
      catch (error) { await this.repository.markIngestionFailed(settings, run.id, attempt, error instanceof Error ? error.message : 'Unknown JUnit ingestion error.'); failed += 1; }
    }
    return { data: { projectId: id, scannedRunCount: runs.length, syncedRunCount: synced, skippedRunCount: skipped, failedRunCount: failed } };
  }
}
