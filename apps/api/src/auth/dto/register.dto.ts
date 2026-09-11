import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsString() @MinLength(1) @MaxLength(255) fullName!: string;
  @IsString() @Matches(/^[a-zA-Z0-9._-]+$/u) @MaxLength(100) username!: string;
  @IsEmail() @MaxLength(320) email!: string;
  @IsString() @MinLength(6) @MaxLength(50) phone!: string;
  @IsOptional() @IsString() @MaxLength(255) organization?: string;
  @IsString() @MinLength(8) @MaxLength(72) password!: string;
}
