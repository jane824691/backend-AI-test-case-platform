import { Module } from '@nestjs/common';
import { TestCasesController } from './test-cases.controller';
import { TestCasesService } from './test-cases.service';

@Module({ controllers: [TestCasesController], providers: [TestCasesService] })
export class TestCasesModule {}
