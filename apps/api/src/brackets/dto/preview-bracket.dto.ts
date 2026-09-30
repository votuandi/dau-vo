import {
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';

export class PreviewBracketDto {
  @IsString()
  @Length(1, 8192)
  setupToken!: string;

  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  designatedByeAthleteIds!: string[];

  /** Omitted values retain the legacy random/manual interpretation. */
  @IsOptional()
  @IsIn(['RANDOM', 'MANUAL', 'SEEDED'])
  byeStrategy?: 'RANDOM' | 'MANUAL' | 'SEEDED';
}
