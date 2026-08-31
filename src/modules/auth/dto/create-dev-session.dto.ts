import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';
import { Role } from '../../../common/domain/role';

export class CreateDevSessionDto {
  @IsEnum(Role)
  role!: Role;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}

