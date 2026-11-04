import { Module } from '@nestjs/common';
import { CiRepository } from './ci.repository';
import { CiService } from './ci.service';
import { GithubWebhookController, ProjectCiController } from './ci.controller';
import { GithubArtifactService } from './github-artifact.service';

@Module({ controllers: [ProjectCiController, GithubWebhookController], providers: [CiRepository, CiService, GithubArtifactService] })
export class CiModule {}
