import { IsString, MaxLength } from 'class-validator';

export class LogoutDto {
  @IsString()
  @MaxLength(2048)
  refreshToken!: string;
}
