export type ErrorCode =
  | 'INVALID_INPUT'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'RATE_LIMITED'
  | 'SERVICE_UNAVAILABLE'
  | 'INVALID_CODE'
  | 'INVALID_CODE_LAST_ATTEMPT'
  | 'CODE_EXPIRED'
  | 'TOO_MANY_ATTEMPTS'
  | 'INTERNAL_ERROR';

/**
 * An error the client is meant to see. Services throw it with the HTTP status
 * and code; the central error handler turns it into the response.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;

  constructor(status: number, code: ErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
  }
}

export interface ErrorResponse {
  status: number;
  code: ErrorCode;
  message: string;
  requestId: string;
}
