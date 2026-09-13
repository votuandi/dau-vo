import { IsBooleanString, IsOptional, IsUUID } from 'class-validator';

export class MatchListQueryDto {
  @IsOptional()
  @IsUUID()
  weightClassId?: string;

  @IsOptional()
  @IsBooleanString()
  unassigned?: string;
}
