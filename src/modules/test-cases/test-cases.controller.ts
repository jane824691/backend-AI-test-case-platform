import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/authorization/current-user.decorator';
import { Permission } from '../../common/authorization/permission';
import { RequirePermission } from '../../common/authorization/require-permission.decorator';
import { SessionUser } from '../../common/auth/session-user';
import { UpdateTestCaseDto } from './dto/update-test-case.dto';
import { UpdateTestCaseResultDto } from './dto/update-test-case-result.dto';
import { TestCasesService } from './test-cases.service';

@Controller('projects/:projectId/test-cases')
export class TestCasesController {
  constructor(private readonly testCasesService: TestCasesService) {}

  @Get()
  @RequirePermission(Permission.TestCaseRead)
  list(@Param('projectId') projectId: string) {
    return this.testCasesService.list(projectId);
  }

  @Get(':testCaseId')
  @RequirePermission(Permission.TestCaseRead)
  getDetail(@Param('projectId') projectId: string, @Param('testCaseId') testCaseId: string) {
    return this.testCasesService.getDetail(projectId, testCaseId);
  }

  @Patch(':testCaseId')
  @RequirePermission(Permission.TestCaseEdit)
  update(@Param('projectId') projectId: string, @Param('testCaseId') testCaseId: string, @Body() input: UpdateTestCaseDto, @CurrentUser() user: SessionUser) {
    return this.testCasesService.update(projectId, testCaseId, input, user);
  }

  @Post(':testCaseId/publish')
  @RequirePermission(Permission.TestCasePublish)
  publish(@Param('projectId') projectId: string, @Param('testCaseId') testCaseId: string, @CurrentUser() user: SessionUser) {
    return this.testCasesService.publish(projectId, testCaseId, user);
  }

  @Post(':testCaseId/reopen')
  @RequirePermission(Permission.TestCaseReopen)
  reopen(@Param('projectId') projectId: string, @Param('testCaseId') testCaseId: string, @CurrentUser() user: SessionUser) {
    return this.testCasesService.reopen(projectId, testCaseId, user);
  }

  @Patch(':testCaseId/result')
  @RequirePermission(Permission.TestCaseResultUpdate)
  updateResult(@Param('projectId') projectId: string, @Param('testCaseId') testCaseId: string, @Body() input: UpdateTestCaseResultDto, @CurrentUser() user: SessionUser) {
    return this.testCasesService.updateResult(projectId, testCaseId, input.result, user);
  }
}

@Controller('projects/:projectId/sections/:sectionId/test-cases')
export class SectionTestCasesController {
  constructor(private readonly testCasesService: TestCasesService) {}

  @Get()
  @RequirePermission(Permission.TestCaseRead)
  listBySection(@Param('projectId') projectId: string, @Param('sectionId') sectionId: string) {
    return this.testCasesService.listBySection(projectId, sectionId);
  }
}
