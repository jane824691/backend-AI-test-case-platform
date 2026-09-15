import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RequestWithUser } from '../auth/request-with-user';
import { Role } from '../domain/role';
import { ProjectRoleResolver } from './project-role-resolver';
import { Permission } from './permission';
import { REQUIRED_PERMISSION_KEY } from './require-permission.decorator';

const allowedRoles: Record<Permission, Role[]> = {
  [Permission.ProjectCreate]: [Role.Admin, Role.PM],
  [Permission.ProjectRead]: [Role.Admin, Role.PM, Role.QA, Role.Developer],
  [Permission.RequirementRead]: [Role.Admin, Role.PM, Role.QA, Role.Developer],
  [Permission.RequirementUpload]: [Role.Admin, Role.PM],
  [Permission.RequirementRegenerate]: [Role.Admin, Role.PM, Role.QA],
  [Permission.TestCaseRead]: [Role.Admin, Role.PM, Role.QA, Role.Developer],
  [Permission.TestCaseEdit]: [Role.Admin, Role.PM, Role.QA],
  [Permission.TestCaseDelete]: [Role.Admin, Role.PM, Role.QA],
  [Permission.TestCasePublish]: [Role.Admin, Role.PM, Role.QA],
  [Permission.TestCaseReopen]: [Role.Admin, Role.PM],
  [Permission.TestCaseResultUpdate]: [Role.Admin, Role.PM, Role.QA, Role.Developer],
  [Permission.PermissionManage]: [Role.Admin],
};

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly projectRoleResolver: ProjectRoleResolver,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permission = this.reflector.getAllAndOverride<Permission>(REQUIRED_PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!permission) return true;

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    if (!request.user) throw new ForbiddenException('No request user is available for authorization.');

    const projectId = typeof request.params.projectId === 'string'
      ? request.params.projectId
      : undefined;
    const role = await this.projectRoleResolver.resolve(projectId, request.user);
    if (!allowedRoles[permission].includes(role)) {
      throw new ForbiddenException(`Role ${role} cannot perform ${permission}.`);
    }
    return true;
  }
}
