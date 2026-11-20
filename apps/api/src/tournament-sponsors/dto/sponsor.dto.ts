import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

/** Upper bound for tier and display index; keeps values well inside a Postgres INTEGER. */
export const SPONSOR_NUMBER_MAX = 1_000_000;

/** "Link quảng cáo" must be a full http(s) website address; other schemes could run script. */
const AD_URL_OPTIONS = {
  protocols: ['http', 'https'],
  require_protocol: true,
  require_valid_protocol: true,
  require_tld: true,
};
const AD_URL_MESSAGE = 'adUrl must be an http or https website address';

export class CreateSponsorDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  details?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @IsUrl(AD_URL_OPTIONS, { message: AD_URL_MESSAGE })
  adUrl?: string | null;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(SPONSOR_NUMBER_MAX)
  tier!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  tierName!: string;

  /** Omitted → the next free position after the current last sponsor. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(SPONSOR_NUMBER_MAX)
  displayIndex?: number;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}

export class UpdateSponsorDto {
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
  @IsString()
  @MaxLength(2048)
  @IsUrl(AD_URL_OPTIONS, { message: AD_URL_MESSAGE })
  adUrl?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(SPONSOR_NUMBER_MAX)
  tier?: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  tierName?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(SPONSOR_NUMBER_MAX)
  displayIndex?: number;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}
