import { Body, Controller, Get, Param, Post } from '@nestjs/common';
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
  upload(@Param('projectId') projectId: string, @Body() input: UploadRequirementDto) {
    return this.requirementsService.upload(projectId, input);
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

