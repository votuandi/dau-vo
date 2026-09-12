import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const CATALOG_CODE = /^[A-Z][A-Z0-9_]*$/;

export class SportIdParamDto {
  @IsUUID() id!: string;
}

export class CreateSportDto {
  @IsString() @Matches(CATALOG_CODE) @MaxLength(100) code!: string;
  @IsString() @MinLength(1) @MaxLength(255) name!: string;
  @IsUUID() sportGroupId!: string;
  @IsBoolean() isActive!: boolean;
}

export class UpdateSportDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(255) name?: string;
  @IsOptional() @IsUUID() sportGroupId?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
