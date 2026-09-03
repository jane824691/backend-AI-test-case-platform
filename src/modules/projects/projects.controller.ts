import { Controller, Get, Param } from '@nestjs/common';
import { SessionUser } from '../../common/auth/session-user';
import { CurrentUser } from '../../common/authorization/current-user.decorator';
import { Permission } from '../../common/authorization/permission';
import { RequirePermission } from '../../common/authorization/require-permission.decorator';
import { ProjectsService } from './projects.service';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  @RequirePermission(Permission.ProjectRead)
  listProjects(@CurrentUser() user: SessionUser) {
    return this.projectsService.list(user);
  }

  @Get(':projectId/workspace')
  @RequirePermission(Permission.ProjectRead)
  getWorkspace(@Param('projectId') projectId: string) {
    return this.projectsService.getWorkspace(projectId);
  }
}
