import { Module } from '@nestjs/common';
import { RequirementsController } from './requirements.controller';
import { RequirementsService } from './requirements.service';

@Module({ controllers: [RequirementsController], providers: [RequirementsService] })
export class RequirementsModule {}

