import { Injectable } from '@nestjs/common';
import { SessionUser } from '../../common/auth/session-user';
import { ProjectRepository } from '../../infrastructure/db/repositories/project.repository';

@Injectable()
export class ProjectsService {
  constructor(private readonly projectRepository: ProjectRepository) {}

  async list(user: SessionUser) {
    const items = await this.projectRepository.listForUser(Number(user.userId), user.globalRole);
    return {
      data: {
        items: items.map((project) => ({
          project_id: project.projectId,
          name: project.name,
        })),
        total: items.length,
      },
    };
  }
}
