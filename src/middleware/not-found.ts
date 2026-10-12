import type { RequestHandler } from 'express';
import { AppError } from '../lib/errors.ts';

export const notFound: RequestHandler = (req) => {
  throw new AppError(404, 'NOT_FOUND', `No route for ${req.method} ${req.path}`);
};
