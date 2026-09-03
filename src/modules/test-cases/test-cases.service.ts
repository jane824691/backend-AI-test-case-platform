import { Injectable, NotFoundException } from '@nestjs/common';
import { SessionUser } from '../../common/auth/session-user';
import { PassFailResult, TestCaseStatus } from '../../common/domain/test-case';
import { stubResponse } from '../../common/http/api-response';
import { TestCaseRepository } from '../../infrastructure/db/repositories/test-case.repository';
import { toTestCaseDetailResponse, toTestCaseSummaryResponse } from './dto/test-case-response.dto';
import { UpdateTestCaseDto } from './dto/update-test-case.dto';

@Injectable()
export class TestCasesService {
  constructor(private readonly testCaseRepository: TestCaseRepository) {}

  async list(projectId: string) {
    const items = (await this.testCaseRepository.listByProject(Number(projectId))).map(toTestCaseSummaryResponse);
    return { data: { projectId: Number(projectId), items, total: items.length } };
  }

  async listBySection(projectId: string, sectionId: string) {
    const items = (await this.testCaseRepository.listBySection(Number(projectId), Number(sectionId))).map(
      toTestCaseSummaryResponse,
    );
    return {
      data: {
        projectId: Number(projectId),
        requirementSectionId: Number(sectionId),
        items,
        total: items.length,
      },
    };
  }

  async getDetail(projectId: string, testCaseId: string) {
    const testCase = await this.testCaseRepository.findDetail(Number(projectId), Number(testCaseId));
    if (!testCase) throw new NotFoundException(`Test case ${testCaseId} was not found for project ${projectId}.`);
    return { data: toTestCaseDetailResponse(testCase) };
  }

  update(projectId: string, testCaseId: string, input: UpdateTestCaseDto, user: SessionUser) {
    return stubResponse({ projectId, testCaseId, patch: input, updatedBy: user.name });
  }

  publish(projectId: string, testCaseId: string, user: SessionUser) {
    return stubResponse({ projectId, testCaseId, currentStatus: TestCaseStatus.Published, updatedBy: user.name });
  }

  reopen(projectId: string, testCaseId: string, user: SessionUser) {
    return stubResponse({ projectId, testCaseId, currentStatus: TestCaseStatus.Draft, updatedBy: user.name });
  }

  updateResult(projectId: string, testCaseId: string, result: PassFailResult, user: SessionUser) {
    return stubResponse({ projectId, testCaseId, passFailResult: result, updatedBy: user.name });
  }
}
