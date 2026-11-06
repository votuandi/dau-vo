import { Type } from 'class-transformer';
import { IsInt, Min, Max, ValidateIf } from 'class-validator';

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
}
