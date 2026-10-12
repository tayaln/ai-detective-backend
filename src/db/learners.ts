import { prisma } from './client.ts';

export function findLearner(learnerId: string) {
  return prisma.user.findUnique({
    where: { id: learnerId },
    select: { id: true, email: true, createdAt: true },
  });
}
