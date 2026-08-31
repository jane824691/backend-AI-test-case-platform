import { Global, Module } from '@nestjs/common';
import { mysqlPoolProvider } from './mysql-pool';
import { ProjectMemberRepository } from './repositories/project-member.repository';
import { ProjectRepository } from './repositories/project.repository';
import { UserRepository } from './repositories/user.repository';

@Global()
@Module({
  providers: [mysqlPoolProvider, UserRepository, ProjectRepository, ProjectMemberRepository],
  exports: [mysqlPoolProvider, UserRepository, ProjectRepository, ProjectMemberRepository],
})
export class DatabaseModule {}
