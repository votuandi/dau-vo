import { IsString, IsUUID, Length } from 'class-validator';

export class SwapPreviewAthleteDto {
  @IsString()
  @Length(1, 8192)
  previewToken!: string;

  @IsUUID('all')
  athleteId!: string;

  @IsUUID('all')
  swapWithAthleteId!: string;
}
