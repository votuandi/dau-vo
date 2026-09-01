import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { AthleteColor } from '@prisma/client';

const MAX_DATABASE_INTEGER = 2_147_483_647;

export class MatchAthleteDto {
  @IsEnum(AthleteColor)
  color!: AthleteColor;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  organization!: string;
}

export class CreateMatchDto {
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(2)
  @ValidateNested({ each: true })
  @Type(() => MatchAthleteDto)
  athletes!: MatchAthleteDto[];

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(MAX_DATABASE_INTEGER)
  roundDurationMs?: number;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(MAX_DATABASE_INTEGER)
  breakDurationMs?: number;
}

export class UpdateMatchDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(MAX_DATABASE_INTEGER)
  roundDurationMs?: number;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(MAX_DATABASE_INTEGER)
  breakDurationMs?: number;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(2)
  @ValidateNested({ each: true })
  @Type(() => MatchAthleteDto)
  athletes?: MatchAthleteDto[];
}
