import { Module } from '@nestjs/common';
import { CiRepository } from './ci.repository';
import { CiService } from './ci.service';
import { ProjectCiController } from './ci.controller';
import { GithubActionsPatClient } from './github-actions-pat.client';

@Module({ controllers: [ProjectCiController], providers: [CiRepository, CiService, GithubActionsPatClient] })
export class CiModule {}
