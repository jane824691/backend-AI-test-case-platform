import { IsBoolean, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';
import { Priority, SuggestedTestLevel } from './update-test-case.dto';

export class CreateTestCaseDto {
  @IsNumber()
  requirementSectionId!: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  stableCaseCode?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsOptional()
  @IsString()
  preconditions?: string;

  @IsString()
  @IsNotEmpty()
  expectedResult!: string;

  @IsEnum(Priority)
  priority!: Priority;

  @IsEnum(SuggestedTestLevel)
  suggestedTestLevel!: SuggestedTestLevel;

  @IsOptional()
  @IsString()
  reusabilityNote?: string;

  @IsBoolean()
  unitTestRecommended!: boolean;
}
