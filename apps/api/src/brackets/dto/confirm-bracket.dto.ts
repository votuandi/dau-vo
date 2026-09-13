import { Transform } from 'class-transformer';
import { IsString, Length, Matches } from 'class-validator';

export class ConfirmBracketDto {
  @IsString()
  @Length(1, 8192)
  previewToken!: string;

  @IsString()
  @Length(1, 255)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  idempotencyKey!: string;
}
