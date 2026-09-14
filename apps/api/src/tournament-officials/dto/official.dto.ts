import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { TournamentOfficialRole } from '@prisma/client';

export class CreateTournamentOfficialDto {
  @IsEnum(TournamentOfficialRole)
  role!: TournamentOfficialRole;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;
}

export class UpdateTournamentOfficialDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  isActive?: boolean;

  // Validation intentionally accepts this field so the service can return the
  // stable ROLE_CHANGE_NOT_ALLOWED error rather than silently ignoring it.
  @IsOptional()
  @IsEnum(TournamentOfficialRole)
  role?: TournamentOfficialRole;
}

export class TournamentOfficialListQueryDto {
  @IsOptional()
  @IsEnum(TournamentOfficialRole)
  role?: TournamentOfficialRole;

  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
