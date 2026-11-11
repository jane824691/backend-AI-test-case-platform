import { BadRequestException, Injectable } from '@nestjs/common';
import { SessionUser } from '../../common/auth/session-user';
import { CiRepository } from './ci.repository';
import { UpdateAutomatedTestBindingDto, UpdateCiSettingsDto } from './dto/ci.dto';
import { CiCredentialService } from './ci-credential.service';
import { GithubActionsPatClient } from './github-actions-pat.client';
import { parseJUnit } from './junit.parser';

@Injectable()
export class CiService {
  constructor(private readonly repository: CiRepository, private readonly credentials: CiCredentialService, private readonly github: GithubActionsPatClient) {}

  async getSettings(projectId: string) {
    return { data: await this.repository.getSettings(Number(projectId)) };
  }

  async updateSettings(projectId: string, input: UpdateCiSettingsDto, user: SessionUser) {
    if (input.clearPersonalAccessToken && input.personalAccessToken) throw new BadRequestException('Provide a PAT or request its removal, not both.');
    const data = await this.repository.saveSettings(Number(projectId), Number(user.userId), {
      repositoryOwner: input.repositoryOwner,
      repositoryName: input.repositoryName,
      defaultBranch: input.defaultBranch,
      workflowId: input.workflowId,
      workflowIdentifier: input.workflowDisplayName?.trim() || String(input.workflowId),
      workflowDisplayName: input.workflowDisplayName,
      junitArtifactName: input.junitArtifactName ?? 'ai-test-platform-junit',
    });
    if (input.clearPersonalAccessToken) await this.repository.clearCredential(data.projectCiIntegrationId);
    if (input.personalAccessToken) await this.repository.saveCredential(data.projectCiIntegrationId, Number(user.userId), this.credentials.encrypt(input.personalAccessToken));
    return { data: await this.repository.getSettings(Number(projectId)) };
  }

  async listRuns(projectId: string) {
    const items = await this.repository.listRuns(Number(projectId));
    return { data: { projectId: Number(projectId), items, total: items.length } };
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
    const credential = await this.repository.getCredential(id);
    if (!credential) throw new BadRequestException('Configure a GitHub PAT before syncing.');
    const token = this.credentials.decrypt(credential);
    const runs = await this.github.listCompletedRuns(settings.repositoryOwner, settings.repositoryName, settings.workflowId, settings.defaultBranch, token);
    let synced = 0; let skipped = 0; let failed = 0;
    for (const run of runs) {
      const attempt = run.run_attempt || 1;
      const shouldIngest = await this.repository.recordWorkflowRun(settings, { id: run.id, attempt, workflowId: run.workflow_id, workflow: run.name ?? settings.workflowDisplayName ?? String(run.workflow_id), branch: run.head_branch ?? '', sha: run.head_sha ?? '', conclusion: run.conclusion, startedAt: run.run_started_at, completedAt: run.updated_at });
      if (!shouldIngest) { skipped += 1; continue; }
      try { const xml = await this.github.downloadJUnit(settings.repositoryOwner, settings.repositoryName, run.id, settings.junitArtifactName, token); await this.repository.ingestJUnit(settings, run.id, attempt, parseJUnit(xml)); synced += 1; }
      catch (error) { await this.repository.markIngestionFailed(settings, run.id, attempt, error instanceof Error ? error.message : 'Unknown JUnit ingestion error.'); failed += 1; }
    }
    return { data: { projectId: id, scannedRunCount: runs.length, syncedRunCount: synced, skippedRunCount: skipped, failedRunCount: failed } };
  }
}
