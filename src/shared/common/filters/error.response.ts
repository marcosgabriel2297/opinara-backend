import { HttpStatus } from '@nestjs/common';

export interface ErrorResponse {
  statusCode: HttpStatus;
  timestamp: string;
  path: string;
  message: string;
  errorCode: string;
  details?: unknown;
}
