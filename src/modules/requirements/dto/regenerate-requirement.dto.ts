import { IsArray, IsOptional, IsString } from 'class-validator';

export class RegenerateRequirementDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sectionKeys?: string[];
}

