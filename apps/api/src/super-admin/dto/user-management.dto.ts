import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { UserRole } from '@prisma/client';

const USERNAME = /^[a-zA-Z0-9._-]+$/u;

export class UserIdParamDto {
  @IsUUID() id!: string;
}

export class CreateSuperAdminUserDto {
  @IsString() @MinLength(1) @MaxLength(255) fullName!: string;
  @IsString() @Matches(USERNAME) @MaxLength(100) username!: string;
  @IsEmail() @MaxLength(320) email!: string;
  @IsString() @MinLength(6) @MaxLength(50) phone!: string;
  @IsString() @MinLength(8) @MaxLength(72) password!: string;
  @IsOptional() @IsString() @MaxLength(255) organization?: string;
}

export class UpdateSuperAdminUserDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(255) fullName?: string;
  @IsOptional()
  @IsString()
  @Matches(USERNAME)
  @MaxLength(100)
  username?: string;
  @IsOptional() @IsEmail() @MaxLength(320) email?: string;
  @IsOptional() @IsString() @MinLength(6) @MaxLength(50) phone?: string;
  @IsOptional() @IsString() @MaxLength(255) organization?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class ListSuperAdminUsersDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
  @IsOptional() @IsString() @MaxLength(320) search?: string;
  @IsOptional() @IsEnum(UserRole) role?: UserRole;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE']) activeStatus?:
    'ACTIVE' | 'INACTIVE';
  @IsOptional()
  @IsIn(['ACTIVE', 'SUSPENDED', 'EXPIRED', 'REVOKED', 'NONE'])
  entitlementStatus?: string;
  @IsOptional() @IsIn(['EXCLUDE', 'ONLY', 'INCLUDE']) deletedStatus?:
    'EXCLUDE' | 'ONLY' | 'INCLUDE';
}

export class AdminAccessDto {
  @IsIn(['ACTIVATE', 'SUSPEND', 'REVOKE', 'ADJUST']) action!:
    'ACTIVATE' | 'SUSPEND' | 'REVOKE' | 'ADJUST';
  @IsOptional() @IsDateString() activeFrom?: string;
  @IsOptional() @IsDateString() activeUntil?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) tournamentLimit?: number;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class ReasonDto {
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
