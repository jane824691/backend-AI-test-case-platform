import { Injectable, NotFoundException } from '@nestjs/common';
import { SessionUser } from '../../common/auth/session-user';
import { PassFailResult } from '../../common/domain/test-case';
import { TestCaseRepository } from '../../infrastructure/db/repositories/test-case.repository';
import { CreateTestCaseDto } from './dto/create-test-case.dto';
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

  async create(projectId: string, input: CreateTestCaseDto, user: SessionUser) {
    const created = await this.testCaseRepository.createManualDraft(Number(projectId), input, Number(user.userId));
    return { data: toTestCaseDetailResponse(created) };
  }

  async update(projectId: string, testCaseId: string, input: UpdateTestCaseDto, user: SessionUser) {
    const updated = await this.testCaseRepository.createEditedVersion(
      Number(projectId),
      Number(testCaseId),
      input,
      Number(user.userId),
    );
    return { data: toTestCaseDetailResponse(updated) };
  }

  async publish(projectId: string, testCaseId: string, user: SessionUser) {
    const updated = await this.testCaseRepository.publish(Number(projectId), Number(testCaseId), Number(user.userId));
    return { data: toTestCaseDetailResponse(updated) };
  }

  async reopen(projectId: string, testCaseId: string, user: SessionUser) {
    const updated = await this.testCaseRepository.reopen(Number(projectId), Number(testCaseId), Number(user.userId));
    return { data: toTestCaseDetailResponse(updated) };
  }

  async updateResult(projectId: string, testCaseId: string, result: PassFailResult, user: SessionUser) {
    const updated = await this.testCaseRepository.updateResult(
      Number(projectId),
      Number(testCaseId),
      result,
      Number(user.userId),
    );
    return { data: toTestCaseDetailResponse(updated) };
  }
}
