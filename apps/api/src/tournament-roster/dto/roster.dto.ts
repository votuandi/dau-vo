import {
  IsInt,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class CreateRosterItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  details?: string | null;
}

export class UpdateRosterItemDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  details?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateAthleteDto {
  @IsString() @MinLength(1) @MaxLength(255) name!: string;
  @Type(() => Number) @IsInt() birthYear!: number;
  @IsUUID() weightClassId!: string;
  @IsOptional() @IsUUID() unitId?: string | null;
  @IsOptional() @IsString() @MaxLength(5000) details?: string | null;
}

export class UpdateAthleteDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(255) name?: string;
  @IsOptional() @Type(() => Number) @IsInt() birthYear?: number;
  @IsOptional() @IsUUID() weightClassId?: string;
  @IsOptional() @IsUUID() unitId?: string | null;
  @IsOptional() @IsString() @MaxLength(5000) details?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class AthleteListQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() page?: number;
  @IsOptional() @Type(() => Number) @IsInt() pageSize?: number;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsUUID() weightClassId?: string;
  @IsOptional() @IsUUID() unitId?: string;
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  noUnit?: boolean;
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  isActive?: boolean;
}
