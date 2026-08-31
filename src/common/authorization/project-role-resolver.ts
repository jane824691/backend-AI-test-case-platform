import { ForbiddenException, Injectable } from '@nestjs/common';
import { Role } from '../domain/role';
import { SessionUser } from '../auth/session-user';
import { ProjectMemberRepository } from '../../infrastructure/db/repositories/project-member.repository';

@Injectable()
export class ProjectRoleResolver {
  constructor(private readonly projectMemberRepository: ProjectMemberRepository) {}

  async resolve(projectId: string | undefined, user: SessionUser): Promise<Role> {
    if (!projectId) return user.globalRole;
    if (user.globalRole === Role.Admin) return Role.Admin;

    const numericProjectId = Number(projectId);
    const numericUserId = Number(user.userId);
    if (!Number.isInteger(numericProjectId) || !Number.isInteger(numericUserId)) {
      throw new ForbiddenException('A valid project membership is required.');
    }

    const membership = await this.projectMemberRepository.findByProjectAndUser(numericProjectId, numericUserId);
    if (!membership) {
      throw new ForbiddenException('The current user is not a member of this project.');
    }
    return membership.role;
  }
}
