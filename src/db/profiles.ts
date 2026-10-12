import { prisma } from './client.ts';

export async function createEmptyProfile(learnerId: string): Promise<void> {
  await prisma.profile.create({ data: { learnerId } });
}

/**
 * Stamps last_seen_at and returns the profile. Upserts so a learner whose
 * profile row is missing gets one instead of an error.
 */
export function touchProfile(learnerId: string) {
  const now = new Date();
  return prisma.profile.upsert({
    where: { learnerId },
    create: { learnerId, lastSeenAt: now },
    update: { lastSeenAt: now },
    select: { detectiveName: true, avatarId: true, soundOn: true, lastSeenAt: true },
  });
}
