import { Body, Controller, Delete, Get, Param, Put, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/authorization/current-user.decorator';
import { Permission } from '../../common/authorization/permission';
import { RequirePermission } from '../../common/authorization/require-permission.decorator';
import { SessionUser } from '../../common/auth/session-user';
import { CiService } from './ci.service';
import { UpdateAutomatedTestBindingDto, UpdateCiSettingsDto } from './dto/ci.dto';

@Controller('projects/:projectId')
export class ProjectCiController {
  constructor(private readonly service: CiService) {}

  @Get('ci-settings') @RequirePermission(Permission.CiRunRead)
  getSettings(@Param('projectId') projectId: string) { return this.service.getSettings(projectId); }

  @Put('ci-settings') @RequirePermission(Permission.CiSettingsManage)
  updateSettings(@Param('projectId') projectId: string, @Body() input: UpdateCiSettingsDto, @CurrentUser() user: SessionUser) { return this.service.updateSettings(projectId, input, user); }

  @Get('ci-runs') @RequirePermission(Permission.CiRunRead)
  listRuns(@Param('projectId') projectId: string) { return this.service.listRuns(projectId); }

  @Post('ci-sync') @RequirePermission(Permission.CiSyncTrigger)
  sync(@Param('projectId') projectId: string) { return this.service.syncCompletedRuns(projectId); }

  @Put('test-cases/:testCaseId/automated-test-binding') @RequirePermission(Permission.AutomatedTestBindingManage)
  bind(@Param('projectId') projectId: string, @Param('testCaseId') testCaseId: string, @Body() input: UpdateAutomatedTestBindingDto, @CurrentUser() user: SessionUser) { return this.service.upsertBinding(projectId, testCaseId, input, user); }

  @Delete('test-cases/:testCaseId/automated-test-binding') @RequirePermission(Permission.AutomatedTestBindingManage)
  unbind(@Param('projectId') projectId: string, @Param('testCaseId') testCaseId: string) { return this.service.deleteBinding(projectId, testCaseId); }
}
