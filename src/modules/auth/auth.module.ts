import { Module } from '@nestjs/common';
import { ProjectRoleResolver } from '../../common/authorization/project-role-resolver';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionStore } from './session/session-store';

@Module({
  controllers: [AuthController],
  providers: [AuthService, SessionStore, ProjectRoleResolver],
  exports: [SessionStore, ProjectRoleResolver],
})
export class AuthModule {}

