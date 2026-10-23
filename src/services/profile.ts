import { findLearner } from '../db/learners.ts';
import { createIdentity, type Identity, updateIdentity } from '../db/profiles.ts';
import { AppError } from '../lib/errors.ts';

/** Creates the detective identity. Sound starts on; the client cannot set it here. */
export async function createProfile(learnerId: string, identity: Identity) {
  const learner = await findLearner(learnerId);
  if (!learner) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
  }
  const profile = await createIdentity(learnerId, learner.email, identity);
  if (!profile) {
    throw new AppError(409, 'CONFLICT', 'Your detective profile is already set up.');
  }
  return profile;
}

/** Updates whichever of name, avatar and sound preference are sent. */
export async function updateProfile(
  learnerId: string,
  changes: Partial<Identity & { soundOn: boolean }>,
) {
  const profile = await updateIdentity(learnerId, changes);
  if (!profile) {
    throw new AppError(404, 'NOT_FOUND', 'Set up your detective profile first.');
  }
  return profile;
}
