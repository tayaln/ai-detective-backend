import { prisma } from './client.ts';

export function findLearner(learnerId: string) {
  return prisma.user.findUnique({
    where: { id: learnerId },
    select: { id: true, email: true, createdAt: true },
  });
}

/** The learner's email and detective name, for notifications and the sheet. */
export function findLearnerContact(learnerId: string) {
  return prisma.user.findUnique({
    where: { id: learnerId },
    select: { email: true, profile: { select: { detectiveName: true } } },
  });
}
