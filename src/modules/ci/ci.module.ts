import { Module } from '@nestjs/common';
import { CiRepository } from './ci.repository';
import { CiService } from './ci.service';
import { ProjectCiController } from './ci.controller';
import { GithubActionsPatClient } from './github-actions-pat.client';
import { CiCredentialService } from './ci-credential.service';

@Module({ controllers: [ProjectCiController], providers: [CiRepository, CiService, CiCredentialService, GithubActionsPatClient] })
export class CiModule {}
