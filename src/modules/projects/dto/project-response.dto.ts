import { DbProjectSummary, DbRequirementSectionSummary } from '../../../infrastructure/db/repositories/project.repository';
import { DbTestCaseSummary } from '../../../infrastructure/db/repositories/test-case.repository';
import { toTestCaseSummaryResponse, TestCaseSummaryResponseDto } from '../../test-cases/dto/test-case-response.dto';

export interface ProjectSummaryResponseDto {
  projectId: number;
  name: string;
  statusCode: number;
  owner: {
    userId: number;
    name: string;
    role: string;
  } | null;
  membersSummary: {
    total: number;
    admins: number;
    pms: number;
    qas: number;
    developers: number;
  };
  latestRequirementVersion: RequirementVersionSummaryResponseDto | null;
  sectionCount: number;
  testCaseCount: number;
  draftCount: number;
  publishedCount: number;
  rejectedCount: number;
  updatedAt: string;
}

export interface RequirementVersionSummaryResponseDto {
  requirementVersionId: number;
  versionNumber: number;
  changeSummary: string | null;
  updatedAt: string | null;
}

export interface RequirementSectionSummaryResponseDto {
  requirementSectionId: number;
  sectionKey: string;
  heading: string;
  headingPath: string;
  sectionOrder: number;
  statusCode: number;
  testCaseCount: number;
  draftCount: number;
  publishedCount: number;
  rejectedCount: number;
}

export interface ProjectWorkspaceResponseDto {
  project: ProjectSummaryResponseDto;
  latestRequirementVersion: RequirementVersionSummaryResponseDto | null;
  sections: RequirementSectionSummaryResponseDto[];
  recentTestCases: TestCaseSummaryResponseDto[];
}

export function toProjectSummaryResponse(project: DbProjectSummary): ProjectSummaryResponseDto {
  return {
    projectId: project.project_id,
    name: project.name,
    statusCode: project.status_code,
    owner: project.owner
      ? {
          userId: project.owner.user_id,
          name: project.owner.name,
          role: project.owner.role,
        }
      : null,
    membersSummary: {
      total: project.members_summary.total,
      admins: project.members_summary.admins,
      pms: project.members_summary.pms,
      qas: project.members_summary.qas,
      developers: project.members_summary.developers,
    },
    latestRequirementVersion: project.latest_requirement_version
      ? {
          requirementVersionId: project.latest_requirement_version.requirement_version_id,
          versionNumber: project.latest_requirement_version.version_number,
          changeSummary: project.latest_requirement_version.change_summary,
          updatedAt: project.latest_requirement_version.updated_at,
        }
      : null,
    sectionCount: project.section_count,
    testCaseCount: project.test_case_count,
    draftCount: project.draft_count,
    publishedCount: project.published_count,
    rejectedCount: project.rejected_count,
    updatedAt: project.updated_at,
  };
}

export function toRequirementSectionSummaryResponse(
  section: DbRequirementSectionSummary,
): RequirementSectionSummaryResponseDto {
  return {
    requirementSectionId: section.requirement_section_id,
    sectionKey: section.section_key,
    heading: section.heading,
    headingPath: section.heading_path,
    sectionOrder: section.section_order,
    statusCode: section.status_code,
    testCaseCount: section.test_case_count,
    draftCount: section.draft_count,
    publishedCount: section.published_count,
    rejectedCount: section.rejected_count,
  };
}

export function toProjectWorkspaceResponse(input: {
  project: DbProjectSummary;
  sections: DbRequirementSectionSummary[];
  recentTestCases: DbTestCaseSummary[];
}): ProjectWorkspaceResponseDto {
  const project = toProjectSummaryResponse(input.project);
  return {
    project,
    latestRequirementVersion: project.latestRequirementVersion,
    sections: input.sections.map(toRequirementSectionSummaryResponse),
    recentTestCases: input.recentTestCases.map(toTestCaseSummaryResponse),
  };
}
