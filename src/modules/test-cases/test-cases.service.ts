import { Injectable } from '@nestjs/common';
import { SessionUser } from '../../common/auth/session-user';
import { PassFailResult, TestCaseStatus } from '../../common/domain/test-case';
import { stubResponse } from '../../common/http/api-response';
import { UpdateTestCaseDto } from './dto/update-test-case.dto';

@Injectable()
export class TestCasesService {
  list(projectId: string) {
    return stubResponse({ projectId, items: [] });
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

