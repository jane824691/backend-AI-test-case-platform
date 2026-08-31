import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class UploadRequirementDto {
  @IsString()
  @IsNotEmpty()
  markdown!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  changeSummary?: string;
}

