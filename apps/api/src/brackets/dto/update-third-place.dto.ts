import { IsBoolean } from 'class-validator';

export class UpdateThirdPlaceMatchDto {
  /** "Thực hiện trận tranh hạng 3". */
  @IsBoolean()
  enabled!: boolean;
}
