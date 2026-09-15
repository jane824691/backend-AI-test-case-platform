import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class UploadRequirementDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  projectName?: string;

  @IsString()
  @IsNotEmpty()
  markdown!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  changeSummary?: string;
}
