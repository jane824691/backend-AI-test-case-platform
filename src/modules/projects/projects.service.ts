import { Injectable, NotFoundException } from '@nestjs/common';
import { SessionUser } from '../../common/auth/session-user';
import { Role } from '../../common/domain/role';
import { ProjectRepository } from '../../infrastructure/db/repositories/project.repository';
import { TestCaseRepository } from '../../infrastructure/db/repositories/test-case.repository';
import { toProjectSummaryResponse, toProjectWorkspaceResponse } from './dto/project-response.dto';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly projectRepository: ProjectRepository,
    private readonly testCaseRepository: TestCaseRepository,
  ) {}

  async list(user: SessionUser) {
    const includeAllProjects = user.globalRole === Role.Developer
      && user.isDevelopmentSession
      && process.env.NODE_ENV !== 'production';
    const projects = await this.projectRepository.listForUser(Number(user.userId), user.globalRole, includeAllProjects);
    const items = projects.map(toProjectSummaryResponse);
    return {
      data: {
        items,
        total: items.length,
      },
    };
  }

  async getWorkspace(projectId: string) {
    const numericProjectId = Number(projectId);
    const project = await this.projectRepository.findSummaryById(numericProjectId);
    if (!project) throw new NotFoundException(`Project ${projectId} was not found.`);

    const sections = await this.projectRepository.listLatestVersionSections(numericProjectId);
    const recentTestCases = (await this.testCaseRepository.listByProject(numericProjectId)).slice(0, 5);

    return {
      data: toProjectWorkspaceResponse({ project, sections, recentTestCases }),
    };
  }
}
