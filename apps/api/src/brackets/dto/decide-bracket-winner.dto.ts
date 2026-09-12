import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export class DecideBracketWinnerDto {
  @IsUUID() entrantId!: string;
  @IsString() @IsNotEmpty() @MaxLength(500) reason!: string;
  @IsString() @IsNotEmpty() @MaxLength(255) idempotencyKey!: string;
}
