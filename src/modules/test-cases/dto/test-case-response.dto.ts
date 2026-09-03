import { DbTestCaseDetail, DbTestCaseSummary } from '../../../infrastructure/db/repositories/test-case.repository';

export interface TestCaseSummaryResponseDto {
  testCaseId: number;
  projectId: number;
  requirementSectionId: number | null;
  sectionKey: string | null;
  stableCaseCode: string;
  currentStatus: string;
  updatedByUserId: number | null;
  updatedByUserName: string | null;
  updatedAt: string | null;
  passFailResult: string | null;
  passFailUpdatedByUserId: number | null;
  passFailUpdatedByName: string | null;
  latestVersion: {
    testCaseVersionId: number | null;
    revisionNumber: number | null;
    title: string | null;
    priority: string | null;
    suggestedTestLevel: string | null;
  };
}

export interface TestCaseDetailResponseDto extends TestCaseSummaryResponseDto {
  currentTestCaseVersionId: number | null;
  publishedTestCaseVersionId: number | null;
  latestVersion: TestCaseSummaryResponseDto['latestVersion'] & {
    description: string | null;
    preconditions: string | null;
    expectedResult: string | null;
    reusabilityNote: string | null;
    unitTestRecommended: boolean;
    generatedByAi: boolean;
    updatedByUserId: number | null;
    updatedByUserName: string | null;
    updatedAt: string | null;
  };
}

export function toTestCaseSummaryResponse(testCase: DbTestCaseSummary): TestCaseSummaryResponseDto {
  return {
    testCaseId: testCase.test_case_id,
    projectId: testCase.project_id,
    requirementSectionId: testCase.requirement_section_id,
    sectionKey: testCase.section_key,
    stableCaseCode: testCase.stable_case_code,
    currentStatus: testCase.current_status,
    updatedByUserId: testCase.updated_by_user_id,
    updatedByUserName: testCase.updated_by_user_name,
    updatedAt: testCase.updated_at,
    passFailResult: testCase.pass_fail_result,
    passFailUpdatedByUserId: testCase.pass_fail_updated_by_user_id,
    passFailUpdatedByName: testCase.pass_fail_updated_by_name,
    latestVersion: {
      testCaseVersionId: testCase.latest_version.test_case_version_id,
      revisionNumber: testCase.latest_version.revision_number,
      title: testCase.latest_version.title,
      priority: testCase.latest_version.priority,
      suggestedTestLevel: testCase.latest_version.suggested_test_level,
    },
  };
}

export function toTestCaseDetailResponse(testCase: DbTestCaseDetail): TestCaseDetailResponseDto {
  const summary = toTestCaseSummaryResponse(testCase);
  return {
    ...summary,
    currentTestCaseVersionId: testCase.current_test_case_version_id,
    publishedTestCaseVersionId: testCase.published_test_case_version_id,
    latestVersion: {
      ...summary.latestVersion,
      description: testCase.latest_version.description,
      preconditions: testCase.latest_version.preconditions,
      expectedResult: testCase.latest_version.expected_result,
      reusabilityNote: testCase.latest_version.reusability_note,
      unitTestRecommended: testCase.latest_version.unit_test_recommended,
      generatedByAi: testCase.latest_version.generated_by_ai,
      updatedByUserId: testCase.latest_version.updated_by_user_id,
      updatedByUserName: testCase.latest_version.updated_by_user_name,
      updatedAt: testCase.latest_version.updated_at,
    },
  };
}
