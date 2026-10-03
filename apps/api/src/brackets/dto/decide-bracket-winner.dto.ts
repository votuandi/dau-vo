import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export const bracketWinnerDecisionTypes = [
  'ADMIN_TIEBREAK',
  'WITHDRAWAL_OR_INJURY',
] as const;
export type BracketWinnerDecisionType =
  (typeof bracketWinnerDecisionTypes)[number];

export class DecideBracketWinnerDto {
  @IsUUID() entrantId!: string;

  @IsIn(bracketWinnerDecisionTypes)
  decisionType!: BracketWinnerDecisionType;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  idempotencyKey!: string;
}
