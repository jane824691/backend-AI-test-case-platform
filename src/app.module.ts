import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { RequirementsModule } from './modules/requirements/requirements.module';
import { TestCasesModule } from './modules/test-cases/test-cases.module';
import { DatabaseModule } from './infrastructure/db/database.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { PermissionGuard } from './common/authorization/permission.guard';
import { SessionAuthGuard } from './common/authorization/session-auth.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    RedisModule,
    AuthModule,
    HealthModule,
    ProjectsModule,
    RequirementsModule,
    TestCasesModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: SessionAuthGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
  ],
})
export class AppModule {}
