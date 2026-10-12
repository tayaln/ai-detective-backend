import type { Request, RequestHandler } from 'express';
import { rateLimit as expressRateLimit } from 'express-rate-limit';
import { AppError } from '../lib/errors.ts';

export interface RateLimitOptions {
  /** Length of the counting window in milliseconds. */
  windowMs: number;
  /** Requests allowed per key in each window. */
  limit: number;
  /** What to count by. Defaults to the client IP. */
  keyGenerator?: (req: Request) => string;
  message?: string;
}

/**
 * Builds a rate limiter for one route. Each call has its own counter, so
 * every feature sets the limit that fits it. Over the limit, it throws a 429
 * through the central error handler like any other error.
 */
export function rateLimit(options: RateLimitOptions): RequestHandler {
  const message = options.message ?? 'Too many requests. Please wait a moment and try again.';
  return expressRateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    ...(options.keyGenerator && { keyGenerator: options.keyGenerator }),
    handler: (_req, _res, next) => {
      next(new AppError(429, 'RATE_LIMITED', message));
    },
  });
}
