import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { SessionUser } from '../../common/auth/session-user';
import { CurrentUser } from '../../common/authorization/current-user.decorator';
import { Permission } from '../../common/authorization/permission';
import { RequirePermission } from '../../common/authorization/require-permission.decorator';
import { RegenerateRequirementDto } from './dto/regenerate-requirement.dto';
import { UploadRequirementDto } from './dto/upload-requirement.dto';
import { RequirementsService } from './requirements.service';

@Controller('projects/:projectId')
export class RequirementsController {
  constructor(private readonly requirementsService: RequirementsService) {}

  @Post('requirement-documents/upload')
  @RequirePermission(Permission.RequirementUpload)
  upload(@Param('projectId') projectId: string, @Body() input: UploadRequirementDto, @CurrentUser() user: SessionUser) {
    return this.requirementsService.upload(projectId, input, user);
  }

  @Patch('requirement-documents/current')
  @RequirePermission(Permission.RequirementUpload)
  updateCurrentRequirementText(
    @Param('projectId') projectId: string,
    @Body() input: UploadRequirementDto,
    @CurrentUser() user: SessionUser,
  ) {
    return this.requirementsService.updateCurrentRequirementText(projectId, input, user);
  }

  @Get('requirement-versions')
  @RequirePermission(Permission.RequirementRead)
  listVersions(@Param('projectId') projectId: string) {
    return this.requirementsService.listVersions(projectId);
  }

  @Get('requirement-versions/:versionId/diff')
  @RequirePermission(Permission.RequirementRead)
  diff(@Param('projectId') projectId: string, @Param('versionId') versionId: string) {
    return this.requirementsService.diff(projectId, versionId);
  }

  @Post('requirement-versions/:versionId/regenerate')
  @RequirePermission(Permission.RequirementRegenerate)
  regenerate(
    @Param('projectId') projectId: string,
    @Param('versionId') versionId: string,
    @Body() input: RegenerateRequirementDto,
  ) {
    return this.requirementsService.regenerate(projectId, versionId, input);
  }
}

@Controller('projects')
export class ProjectRequirementController {
  constructor(private readonly requirementsService: RequirementsService) {}

  @Post('from-requirement')
  @RequirePermission(Permission.ProjectCreate)
  createProjectFromRequirement(@Body() input: UploadRequirementDto, @CurrentUser() user: SessionUser) {
    return this.requirementsService.createProjectFromRequirement(input, user);
  }
}
