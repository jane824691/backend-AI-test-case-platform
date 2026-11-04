import { ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { SessionUser } from '../../common/auth/session-user';
import { CiRepository } from './ci.repository';
import { UpdateAutomatedTestBindingDto, UpdateCiSettingsDto } from './dto/ci.dto';
import { GithubArtifactService } from './github-artifact.service';
import { parseJUnit } from './junit.parser';

@Injectable()
export class CiService {
  constructor(private readonly repository: CiRepository, private readonly githubArtifacts: GithubArtifactService) {}

  async getSettings(projectId: string) {
    return { data: await this.repository.getSettings(Number(projectId)) };
  }

  async updateSettings(projectId: string, input: UpdateCiSettingsDto, user: SessionUser) {
    const data = await this.repository.saveSettings(Number(projectId), Number(user.userId), {
      githubInstallationId: input.githubInstallationId,
      repositoryOwner: input.repositoryOwner,
      repositoryName: input.repositoryName,
      defaultBranch: input.defaultBranch,
      workflowIdentifier: input.workflowIdentifier,
      junitArtifactName: input.junitArtifactName ?? 'ai-test-platform-junit',
    });
    return { data };
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

  async receiveGithubWebhook(rawBody: Buffer | undefined, signature: string | undefined, payload: unknown) {
    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    if (!secret) throw new ForbiddenException('GitHub webhook handling is disabled because GITHUB_WEBHOOK_SECRET is not configured.');
    if (!rawBody || !signature || !this.isValidSignature(rawBody, signature, secret)) {
      throw new UnauthorizedException('GitHub webhook signature is invalid.');
    }
    const event = payload as { repository?: { owner?: { login?: string }; name?: string }; workflow_run?: Record<string, unknown>; action?: string };
    if (event.action !== 'completed' || !event.repository?.owner?.login || !event.repository.name || !event.workflow_run) {
      return { data: { accepted: true, ignored: true } };
    }
    const settings = await this.repository.findIntegrationByRepository(event.repository.owner.login, event.repository.name);
    if (!settings) return { data: { accepted: true, ignored: true } };
    const run = event.workflow_run;
    const id = Number(run.id);
    if (!Number.isSafeInteger(id)) throw new NotFoundException('GitHub workflow run id is missing.');
    const attempt = Number(run.run_attempt ?? 1);
    await this.repository.recordWorkflowRun(settings, {
      id,
      attempt,
      workflow: String(run.name ?? run.path ?? ''),
      branch: String(run.head_branch ?? ''),
      sha: String(run.head_sha ?? ''),
      conclusion: run.conclusion === null || typeof run.conclusion === 'string' ? run.conclusion as string | null : null,
      startedAt: typeof run.run_started_at === 'string' ? run.run_started_at : undefined,
      completedAt: typeof run.updated_at === 'string' ? run.updated_at : undefined,
    });
    try {
      const xml = await this.githubArtifacts.downloadJUnit(settings, id);
      await this.repository.ingestJUnit(settings, id, attempt, parseJUnit(xml));
    } catch (error) {
      await this.repository.markIngestionFailed(settings, id, attempt, error instanceof Error ? error.message : 'Unknown JUnit ingestion error.');
    }
    return { data: { accepted: true, projectId: settings.projectId } };
  }

  private isValidSignature(rawBody: Buffer, signature: string, secret: string): boolean {
    const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
  }
}
