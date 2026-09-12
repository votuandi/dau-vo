import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { TournamentStatus } from '@prisma/client';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class CreateTournamentDto {
  @IsUUID()
  sportId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string | null;

  @IsOptional()
  @IsString()
  @Matches(ISO_DATE_PATTERN, { message: 'startDate must use YYYY-MM-DD' })
  startDate?: string | null;

  @IsOptional()
  @IsString()
  @Matches(ISO_DATE_PATTERN, { message: 'endDate must use YYYY-MM-DD' })
  endDate?: string | null;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(TournamentStatus)
  status?: TournamentStatus;
}

export class UpdateTournamentDto {
  @IsOptional()
  @IsUUID()
  sportId?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string | null;

  @IsOptional()
  @IsString()
  @Matches(ISO_DATE_PATTERN, { message: 'startDate must use YYYY-MM-DD' })
  startDate?: string | null;

  @IsOptional()
  @IsString()
  @Matches(ISO_DATE_PATTERN, { message: 'endDate must use YYYY-MM-DD' })
  endDate?: string | null;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(TournamentStatus)
  status?: TournamentStatus;
}
