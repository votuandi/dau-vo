import { ScoringMethod, ScoringThreshold } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  Min,
  Max,
  ValidateIf,
} from 'class-validator';

export class UpdateBracketRoundStaffingDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  requiredJudgeCount?: number;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  regulationRoundCount?: number;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1000)
  @Max(3600000)
  roundDurationMs?: number;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(ScoringMethod)
  scoringMethod?: ScoringMethod;

  /** Referee-command only: the supervisor also votes, as one more judge ("TT"). */
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  supervisorScoringEnabled?: boolean;

  /** Win rule for an even number of scorers (judges + supervisor "TT"). */
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(ScoringThreshold)
  scoringThreshold?: ScoringThreshold;
}
