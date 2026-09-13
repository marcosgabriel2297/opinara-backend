import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

/** Limite propio para no mandar a Google respuestas desmedidas. */
export const MAX_REPLY_LENGTH = 4096;

export class ReplyReviewDto {
  /**
   * Se recorta antes de validar: una respuesta de solo espacios se publicaria en el perfil
   * publico del negocio como una respuesta en blanco.
   */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_REPLY_LENGTH)
  comment!: string;
}
