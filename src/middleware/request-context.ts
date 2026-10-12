import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { logger } from '../lib/logger.ts';

/**
 * Gives every request an id and a logger bound to it, and writes one access
 * line when the response finishes. Requests that fail are logged by the error
 * handler instead, so a failure never produces two lines.
 */
export const requestContext: RequestHandler = (req, res, next) => {
  const start = performance.now();
  req.id = randomUUID();
  req.log = logger.child({ requestId: req.id });
  res.setHeader('X-Request-Id', req.id);

  res.on('finish', () => {
    if (res.locals.errorLogged === true) {
      return;
    }
    req.log.info(
      {
        method: req.method,
        // Path only: query strings can carry personal data.
        path: req.originalUrl.split('?')[0],
        status: res.statusCode,
        durationMs: Math.round(performance.now() - start),
      },
      'request completed',
    );
  });

  next();
};
