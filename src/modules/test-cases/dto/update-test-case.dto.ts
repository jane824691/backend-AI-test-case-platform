import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

export enum Priority {
  P0 = 'p0',
  P1 = 'p1',
  P2 = 'p2',
  P3 = 'p3',
  High = 'high',
  Medium = 'medium',
  Low = 'low',
}
export enum SuggestedTestLevel { Unit = 'unit', Integration = 'integration', E2E = 'e2e' }

export class UpdateTestCaseDto {
  @IsOptional() @IsNumber() requirementSectionId?: number;
  @IsOptional() @IsString() @MaxLength(255) title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() preconditions?: string;
  @IsOptional() @IsString() expectedResult?: string;
  @IsOptional() @IsEnum(Priority) priority?: Priority;
  @IsOptional() @IsEnum(SuggestedTestLevel) suggestedTestLevel?: SuggestedTestLevel;
  @IsOptional() @IsString() reusabilityNote?: string;
  @IsOptional() @IsBoolean() unitTestRecommended?: boolean;
}
