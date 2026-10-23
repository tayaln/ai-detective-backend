import type { Request, RequestHandler } from 'express';
import { AppError } from '../lib/errors.ts';
import { findLearnerIdForToken } from '../services/auth.ts';

/**
 * Resolves the learner from the bearer token and attaches their id. It does
 * not touch the profile: last_seen_at is written by GET /me only.
 */
export const requireLearner: RequestHandler = async (req, _res, next) => {
  const learnerId = await findLearnerIdForToken(req.headers.authorization);
  if (!learnerId) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
  }
  req.learnerId = learnerId;
  next();
};

/** The signed-in learner's id. Throws if the route forgot requireLearner. */
export function learnerIdOf(req: Request): string {
  if (!req.learnerId) {
    throw new Error('learnerIdOf used on a route without requireLearner');
  }
  return req.learnerId;
}
