import { IsNotEmpty, IsNumber, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class UpdateCiSettingsDto {
  @IsNumber() githubInstallationId!: number;
  @IsString() @Matches(/^[A-Za-z0-9_.-]+$/) repositoryOwner!: string;
  @IsString() @Matches(/^[A-Za-z0-9_.-]+$/) repositoryName!: string;
  @IsString() @MaxLength(255) defaultBranch!: string;
  @IsString() @MaxLength(255) workflowIdentifier!: string;
  @IsOptional() @IsString() @MaxLength(255) junitArtifactName?: string;
}

export class UpdateAutomatedTestBindingDto {
  @IsString() @IsNotEmpty() @Matches(/^TC-[A-Za-z0-9_-]+$/) testIdentifier!: string;
}
