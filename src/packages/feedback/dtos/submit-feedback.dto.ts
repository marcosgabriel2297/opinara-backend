import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export const MAX_COMMENT_LENGTH = 2000;

/** Lo que envia un cliente anonimo desde la landing del QR. */
export class SubmitFeedbackDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_COMMENT_LENGTH)
  comment?: string;
}
