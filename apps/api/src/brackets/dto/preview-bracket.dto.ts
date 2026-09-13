import {
  ArrayUnique,
  IsArray,
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
}
