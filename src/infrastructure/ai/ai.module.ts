import { Module } from '@nestjs/common';
import { AiTestCaseDraftService } from './ai-test-case-draft.service';

@Module({
  providers: [AiTestCaseDraftService],
  exports: [AiTestCaseDraftService],
})
export class AiModule {}
