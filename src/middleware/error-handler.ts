import type { ErrorRequestHandler } from 'express';
import { AppError, type ErrorCode, type ErrorResponse } from '../lib/errors.ts';

const codeForStatus: Record<number, ErrorCode> = {
  400: 'INVALID_INPUT',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  429: 'RATE_LIMITED',
};

/** Errors raised by Express and its body parser carry a 4xx status and a type. */
interface HttpError extends Error {
  status: number;
  type?: string;
}

function isClientHttpError(err: unknown): err is HttpError {
  return (
    err instanceof Error &&
    'status' in err &&
    typeof err.status === 'number' &&
    err.status >= 400 &&
    err.status < 500
  );
}

/**
 * Turns any error into an AppError for the response, and decides what to log.
 * Parse errors are logged without their message, because V8 quotes the
 * offending request body in it, which can include an email address.
 */
function classify(err: unknown): { appError: AppError; logged: unknown } {
  if (err instanceof AppError) {
    return { appError: err, logged: err };
  }
  if (isClientHttpError(err)) {
    const code = codeForStatus[err.status] ?? 'INVALID_INPUT';
    const message =
      err.type === 'entity.parse.failed' ? 'Request body is not valid JSON' : err.message;
    const appError = new AppError(err.status, code, message);
    return { appError, logged: { type: err.type ?? err.name, status: err.status } };
  }
  return {
    appError: new AppError(500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.'),
    logged: err,
  };
}

/**
 * The one place errors are logged and formatted. Route handlers and services
 * throw; nothing else catches to log.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const { appError, logged } = classify(err);

  const level = appError.status >= 500 ? 'error' : 'warn';
  req.log[level](
    {
      err: logged,
      method: req.method,
      path: req.originalUrl.split('?')[0],
      status: appError.status,
      code: appError.code,
    },
    appError.message,
  );
  res.locals.errorLogged = true;

  // A streamed response has already started, so the status line cannot change.
  if (res.headersSent) {
    res.end();
    return;
  }

  if (appError.retryAfter) {
    res.set('Retry-After', appError.retryAfter);
  }

  const body: ErrorResponse = {
    status: appError.status,
    code: appError.code,
    message: appError.message,
    requestId: req.id,
  };
  res.status(appError.status).json(body);
};
