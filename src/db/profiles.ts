import { Prisma } from '../generated/prisma/client.ts';
import { prisma } from './client.ts';

const profileFields = { detectiveName: true, avatarId: true, soundOn: true, lastSeenAt: true };

export async function createEmptyProfile(learnerId: string, email: string): Promise<void> {
  await prisma.profile.create({ data: { learnerId, email } });
}

/**
 * Stamps last_seen_at and returns the profile. Upserts so a learner whose
 * profile row is missing gets one instead of an error. Also refreshes the
 * email copy, so it follows user.email from the next app open.
 */
export function touchProfile(learnerId: string, email: string) {
  const now = new Date();
  return prisma.profile.upsert({
    where: { learnerId },
    create: { learnerId, email, lastSeenAt: now },
    update: { email, lastSeenAt: now },
    select: profileFields,
  });
}

export interface Identity {
  detectiveName: string;
  avatarId: string;
}

/**
 * Sets the detective identity, with sound on, once. Sign-in already created an
 * empty row, so this fills it in; a missing row is created. Returns null when
 * the identity is already set. Each step is atomic, so two concurrent calls
 * cannot both succeed.
 */
export async function createIdentity(learnerId: string, email: string, identity: Identity) {
  const data = { ...identity, email, soundOn: true };
  const [filled] = await prisma.profile.updateManyAndReturn({
    where: { learnerId, detectiveName: null },
    data,
    select: profileFields,
  });
  if (filled) {
    return filled;
  }
  try {
    return await prisma.profile.create({ data: { learnerId, ...data }, select: profileFields });
  } catch (err) {
    // The row exists, so its identity is already set.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return null;
    }
    throw err;
  }
}

/**
 * Changes whichever fields are given. Returns null when the learner has not
 * set up their identity yet.
 */
export async function updateIdentity(
  learnerId: string,
  changes: Partial<Identity & { soundOn: boolean }>,
) {
  const [updated] = await prisma.profile.updateManyAndReturn({
    where: { learnerId, detectiveName: { not: null } },
    data: changes,
    select: profileFields,
  });
  return updated ?? null;
}
