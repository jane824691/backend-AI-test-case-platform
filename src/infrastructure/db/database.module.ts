import { Global, Module } from '@nestjs/common';
import { mysqlPoolProvider } from './mysql-pool';
import { ProjectMemberRepository } from './repositories/project-member.repository';
import { ProjectRepository } from './repositories/project.repository';
import { RequirementRepository } from './repositories/requirement.repository';
import { TestCaseRepository } from './repositories/test-case.repository';
import { UserRepository } from './repositories/user.repository';

@Global()
@Module({
  providers: [
    mysqlPoolProvider,
    UserRepository,
    ProjectRepository,
    ProjectMemberRepository,
    RequirementRepository,
    TestCaseRepository,
  ],
  exports: [
    mysqlPoolProvider,
    UserRepository,
    ProjectRepository,
    ProjectMemberRepository,
    RequirementRepository,
    TestCaseRepository,
  ],
})
export class DatabaseModule {}
