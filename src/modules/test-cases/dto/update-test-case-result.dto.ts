import { IsEnum } from 'class-validator';
import { PassFailResult } from '../../../common/domain/test-case';

export class UpdateTestCaseResultDto {
  @IsEnum(PassFailResult)
  result!: PassFailResult;
}

