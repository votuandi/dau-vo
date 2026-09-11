import { IsString, MaxLength, MinLength } from 'class-validator';

export class MatchAccessLoginDto {
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  matchId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  securityCode!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  deviceId!: string;
}

export class MatchAccessTakeoverDto extends MatchAccessLoginDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2048)
  takeoverToken!: string;
}
