import { Injectable } from '@nestjs/common';
import { SessionUser } from '../../common/auth/session-user';
import {
  AiGeneratedTestCase,
  AiTestCaseDraftService,
} from '../../infrastructure/ai/ai-test-case-draft.service';
import { ProjectRepository } from '../../infrastructure/db/repositories/project.repository';
import { RequirementRepository } from '../../infrastructure/db/repositories/requirement.repository';
import { TestCaseRepository } from '../../infrastructure/db/repositories/test-case.repository';
import { RegenerateRequirementDto } from './dto/regenerate-requirement.dto';
import { UploadRequirementDto } from './dto/upload-requirement.dto';

@Injectable()
export class RequirementsService {
  constructor(
    private readonly projectRepository: ProjectRepository,
    private readonly requirementRepository: RequirementRepository,
    private readonly aiDraftService: AiTestCaseDraftService,
    private readonly testCaseRepository: TestCaseRepository,
  ) {}

  async createProjectFromRequirement(input: UploadRequirementDto, user: SessionUser) {
    const projectName = this.resolveProjectName(input);
    const projectId = await this.projectRepository.createProject(projectName, Number(user.userId), 1);
    return this.upload(String(projectId), { ...input, projectName }, user);
  }

  async upload(projectId: string, input: UploadRequirementDto, user: SessionUser) {
    const numericProjectId = Number(projectId);
    if (input.projectName?.trim()) {
      await this.projectRepository.updateProjectName(numericProjectId, input.projectName.trim());
    }

    const created = await this.requirementRepository.createVersionFromMarkdown(
      numericProjectId,
      input.markdown,
      input.changeSummary ?? null,
      Number(user.userId),
    );

    let generatedTestCaseCount = 0;
    const seenDrafts = new Set<string>();
    const generationSections = this.selectSectionsForAiGeneration(created.sections);
    for (const section of generationSections) {
      const drafts = await this.aiDraftService.generateFromRequirementSection(section.content, input.markdown);
      const uniqueDrafts = this.uniqueDraftsForRequirementUpload(drafts, seenDrafts);
      if (uniqueDrafts.length === 0) continue;

      const createdDrafts = await this.testCaseRepository.createAiGeneratedDrafts(
        numericProjectId,
        section.requirementSectionId,
        uniqueDrafts,
      );
      generatedTestCaseCount += createdDrafts.length;
    }

    return {
      data: {
        projectId: numericProjectId,
        requirementDocumentId: created.version.requirementDocumentId,
        requirementVersionId: created.version.requirementVersionId,
        versionNumber: created.version.versionNumber,
        generationStatus: 'completed',
        sectionCount: created.sections.length,
        generatedTestCaseCount,
        updatedAt: created.version.updatedAt,
      },
    };
  }

  async updateCurrentRequirementText(projectId: string, input: UploadRequirementDto, user: SessionUser) {
    const numericProjectId = Number(projectId);
    if (input.projectName?.trim()) {
      await this.projectRepository.updateProjectName(numericProjectId, input.projectName.trim());
    }

    const updated = await this.requirementRepository.updateLatestVersionText(
      numericProjectId,
      input.markdown,
      input.changeSummary ?? null,
      Number(user.userId),
    );

    return {
      data: {
        projectId: numericProjectId,
        requirementDocumentId: updated.version.requirementDocumentId,
        requirementVersionId: updated.version.requirementVersionId,
        versionNumber: updated.version.versionNumber,
        generationStatus: 'skipped',
        sectionCount: updated.sections.length,
        generatedTestCaseCount: 0,
        updatedAt: updated.version.updatedAt,
      },
    };
  }

  async listVersions(projectId: string) {
    const versions = await this.requirementRepository.listVersions(Number(projectId));
    return {
      data: {
        projectId: Number(projectId),
        items: versions.map((version) => ({
          requirementVersionId: version.requirementVersionId,
          versionNumber: version.versionNumber,
          changeSummary: version.changeSummary,
          updatedAt: version.updatedAt,
        })),
        total: versions.length,
      },
    };
  }

  async diff(projectId: string, versionId: string) {
    const numericProjectId = Number(projectId);
    const numericVersionId = Number(versionId);
    await this.requirementRepository.requireVersion(numericProjectId, numericVersionId);
    const sections = await this.requirementRepository.listVersionSections(numericProjectId, numericVersionId);
    return {
      data: {
        projectId: numericProjectId,
        requirementVersionId: numericVersionId,
        sections: sections.map((section) => ({
          requirementSectionId: section.requirementSectionId,
          sectionKey: section.sectionKey,
          heading: section.heading,
          statusCode: section.statusCode,
        })),
      },
    };
  }

  async regenerate(projectId: string, versionId: string, input: RegenerateRequirementDto) {
    const numericProjectId = Number(projectId);
    const numericVersionId = Number(versionId);
    await this.requirementRepository.requireVersion(numericProjectId, numericVersionId);
    const sections = await this.requirementRepository.listVersionSections(numericProjectId, numericVersionId);
    const selectedSections = sections.filter((section) => {
      const isRequested = !input.sectionKeys || input.sectionKeys.length === 0 || input.sectionKeys.includes(section.sectionKey);
      return isRequested && section.statusCode === 1;
    });
    const generationSections = this.selectSectionsForAiGeneration(selectedSections);

    let generatedTestCaseCount = 0;
    const documentContext = sections.map((section) => section.content).join('\n\n');
    const seenDrafts = new Set<string>();
    for (const section of generationSections) {
      const drafts = await this.aiDraftService.generateFromRequirementSection(section.content, documentContext);
      const uniqueDrafts = this.uniqueDraftsForRequirementUpload(drafts, seenDrafts);
      if (uniqueDrafts.length === 0) continue;

      const createdDrafts = await this.testCaseRepository.createAiGeneratedDrafts(
        numericProjectId,
        section.requirementSectionId,
        uniqueDrafts,
      );
      generatedTestCaseCount += createdDrafts.length;
    }

    return {
      data: {
        projectId: numericProjectId,
        requirementVersionId: numericVersionId,
        sectionKeys: selectedSections.map((section) => section.sectionKey),
        queuedSectionCount: generationSections.length,
        generatedTestCaseCount,
        generationStatus: 'completed',
      },
    };
  }

  private resolveProjectName(input: UploadRequirementDto): string {
    const explicitName = input.projectName?.trim();
    if (explicitName) return explicitName;

    const heading = input.markdown
      .split(/\r?\n/)
      .map((line) => /^#\s+(.+?)\s*$/.exec(line)?.[1]?.trim())
      .find((value): value is string => Boolean(value));
    return heading || `Requirement Project ${new Date().toISOString().slice(0, 10)}`;
  }

  private selectSectionsForAiGeneration<T extends { heading: string; headingPath: string; content: string }>(
    sections: T[],
  ): T[] {
    const sectionsWithBody = sections.filter((section) => this.stripMarkdownHeadings(section.content).length > 0);
    const actionableSections = sectionsWithBody.filter((section) => {
      const label = `${section.heading} ${section.headingPath}`.toLowerCase();
      const body = section.content.toLowerCase();
      const hasActionableHeading = /規則|驗收|條件|限制|流程|權限|驗證|需求|rule|acceptance|criteria|permission|validation/.test(label);
      const isMostlyReference = /範例|例子|背景|概述|說明|example|background|overview/.test(label);
      const hasRequirementLanguage = /必須|需要|應該|應為|不能|不可|只允許|不需要|must|should|required/.test(body);
      return hasActionableHeading || (hasRequirementLanguage && !isMostlyReference);
    });

    return actionableSections.length > 0 ? actionableSections : sectionsWithBody;
  }

  private stripMarkdownHeadings(content: string): string {
    return content
      .split(/\r?\n/)
      .filter((line) => !/^#{1,6}\s+/.test(line.trim()))
      .join('\n')
      .trim();
  }

  private uniqueDraftsForRequirementUpload(
    drafts: AiGeneratedTestCase[],
    seenDrafts: Set<string>,
  ): AiGeneratedTestCase[] {
    const uniqueDrafts: AiGeneratedTestCase[] = [];
    for (const draft of drafts) {
      const signature = [draft.title, draft.description, draft.expectedResult]
        .map((value) => value.trim().replace(/\s+/g, ''))
        .join('|');
      if (seenDrafts.has(signature)) continue;

      seenDrafts.add(signature);
      uniqueDrafts.push(draft);
    }
    return uniqueDrafts;
  }
}
