import { Module } from '@nestjs/common';
import { SectionTestCasesController, TestCasesController } from './test-cases.controller';
import { TestCasesService } from './test-cases.service';

@Module({ controllers: [TestCasesController, SectionTestCasesController], providers: [TestCasesService] })
export class TestCasesModule {}
