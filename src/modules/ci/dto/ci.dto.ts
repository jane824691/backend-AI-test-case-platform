import { IsNotEmpty, IsNumber, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class UpdateCiSettingsDto {
  @IsString() @Matches(/^[A-Za-z0-9_.-]+$/) repositoryOwner!: string;
  @IsString() @Matches(/^[A-Za-z0-9_.-]+$/) repositoryName!: string;
  @IsString() @MaxLength(255) defaultBranch!: string;
  @IsNumber() workflowId!: number;
  @IsOptional() @IsString() @MaxLength(255) workflowDisplayName?: string;
  @IsOptional() @IsString() @MaxLength(255) junitArtifactName?: string;
  @IsOptional() @IsString() @MinLength(1) personalAccessToken?: string;
  @IsOptional() clearPersonalAccessToken?: boolean;
}

export class UpdateAutomatedTestBindingDto {
  @IsString() @IsNotEmpty() @Matches(/^TC-[A-Za-z0-9_-]+$/) testIdentifier!: string;
}
