import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { TournamentOfficialRole } from '@prisma/client';

export class OfficialAccessLoginDto {
  @IsString() @MinLength(1) @MaxLength(32) tournamentCode!: string;
  @IsString() @MinLength(1) @MaxLength(72) privatePasscode!: string;
  @IsString() @MinLength(1) @MaxLength(255) deviceId!: string;
  @IsOptional()
  @IsEnum(TournamentOfficialRole)
  expectedRole?: TournamentOfficialRole;
}

export class OfficialAccessTakeoverDto extends OfficialAccessLoginDto {
  @IsString() @MinLength(1) @MaxLength(2048) takeoverToken!: string;
}
