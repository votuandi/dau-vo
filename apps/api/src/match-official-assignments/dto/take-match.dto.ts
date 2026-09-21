import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export class TakeMatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(99)
  @IsUUID('4', { each: true })
  refereeIds!: string[];
}
