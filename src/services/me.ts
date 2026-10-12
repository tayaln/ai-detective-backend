import { findLearner } from '../db/learners.ts';
import { touchProfile } from '../db/profiles.ts';
import { AppError } from '../lib/errors.ts';

/** The learner and their profile in one response; stamps last_seen_at. */
export async function getMe(learnerId: string) {
  const learner = await findLearner(learnerId);
  if (!learner) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
  }
  const profile = await touchProfile(learnerId);
  return { learner, profile };
}
