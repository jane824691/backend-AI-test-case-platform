import { Body, Controller, Delete, Get, Headers, Param, Put, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { CurrentUser } from '../../common/authorization/current-user.decorator';
import { Permission } from '../../common/authorization/permission';
import { RequirePermission } from '../../common/authorization/require-permission.decorator';
import { Public } from '../../common/authorization/public.decorator';
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

  @Put('test-cases/:testCaseId/automated-test-binding') @RequirePermission(Permission.AutomatedTestBindingManage)
  bind(@Param('projectId') projectId: string, @Param('testCaseId') testCaseId: string, @Body() input: UpdateAutomatedTestBindingDto, @CurrentUser() user: SessionUser) { return this.service.upsertBinding(projectId, testCaseId, input, user); }

  @Delete('test-cases/:testCaseId/automated-test-binding') @RequirePermission(Permission.AutomatedTestBindingManage)
  unbind(@Param('projectId') projectId: string, @Param('testCaseId') testCaseId: string) { return this.service.deleteBinding(projectId, testCaseId); }
}

@Controller('integrations/github')
export class GithubWebhookController {
  constructor(private readonly service: CiService) {}

  @Post('webhooks') @Public()
  receive(@Req() request: Request & { rawBody?: Buffer }, @Headers('x-hub-signature-256') signature: string | undefined, @Body() payload: unknown) {
    return this.service.receiveGithubWebhook(request.rawBody, signature, payload);
  }
}
