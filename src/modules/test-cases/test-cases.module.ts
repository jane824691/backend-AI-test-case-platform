import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SectionTestCasesController, TestCasesController } from './test-cases.controller';
import { TestCasesService } from './test-cases.service';

@Module({
  imports: [AuthModule],
  controllers: [TestCasesController, SectionTestCasesController],
  providers: [TestCasesService],
})
export class TestCasesModule {}
