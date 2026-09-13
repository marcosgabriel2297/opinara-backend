import { PublicUser } from '@shared/models/user';

export interface Session {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
  /** Vigencia del access token, en segundos. */
  expiresIn: number;
}
