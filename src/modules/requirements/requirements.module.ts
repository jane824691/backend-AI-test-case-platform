import { Module } from '@nestjs/common';
import { AiModule } from '../../infrastructure/ai/ai.module';
import { ProjectRequirementController, RequirementsController } from './requirements.controller';
import { RequirementsService } from './requirements.service';

@Module({ imports: [AiModule], controllers: [RequirementsController, ProjectRequirementController], providers: [RequirementsService] })
export class RequirementsModule {}
