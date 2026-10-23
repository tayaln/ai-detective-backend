import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { AUTH_TOKEN_HEADER } from '../lib/auth.ts';
import { config } from '../lib/config.ts';
import { errorHandler } from '../middleware/error-handler.ts';
import { notFound } from '../middleware/not-found.ts';
import { requestContext } from '../middleware/request-context.ts';
import { apiRouter } from '../routes/index.ts';

export function createApp(): Express {
  const app = express();

  // nginx runs on the same machine, so only a loopback proxy is trusted for the
  // client IP. A client cannot spoof X-Forwarded-For past the rate limiter.
  app.set('trust proxy', 'loopback');

  app.use(requestContext);
  app.use(helmet());
  app.use(
    cors({
      origin: config.CORS_ORIGINS,
      // Bearer tokens only, so no cookies or credentials cross origins.
      credentials: false,
      // The frontend reads the bearer token from AUTH_TOKEN_HEADER after sign-in.
      exposedHeaders: [
        'X-Request-Id',
        AUTH_TOKEN_HEADER,
        'RateLimit',
        'RateLimit-Policy',
        'Retry-After',
      ],
    }),
  );
  app.use(express.json({ limit: '100kb' }));

  app.use('/api', apiRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
