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

export class OfficialAccessTokenLoginDto {
  @IsString() @MinLength(1) @MaxLength(2048) token!: string;
  @IsString() @MinLength(1) @MaxLength(255) deviceId!: string;
  @IsOptional()
  @IsEnum(TournamentOfficialRole)
  expectedRole?: TournamentOfficialRole;
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2048)
  takeoverToken?: string;
}

/** Read-only scoreboard access does not create an official session. */
export class ScoreboardSupervisorLoginDto {
  @IsString() @MinLength(1) @MaxLength(32) tournamentCode!: string;
  @IsString() @MinLength(1) @MaxLength(32) scoreboardCode!: string;
}

export class ScoreboardSupervisorStateDto {
  @IsString() @MinLength(1) @MaxLength(2048) token!: string;
}
