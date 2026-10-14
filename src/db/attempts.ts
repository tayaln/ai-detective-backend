import { prisma } from './client.ts';

export interface NewAttempt {
  courseId: string;
  stepId: string;
  stepType: string;
  submittedAnswer: string;
  isCorrect: boolean;
  score: number | null;
}

/**
 * Saves an attempt numbered one past the learner's existing attempts at the
 * step. A transaction-scoped advisory lock on the learner and step makes
 * concurrent submissions take their numbers in turn; the unique key on the
 * number stays as the backstop.
 */
export function createAttempt(learnerId: string, attempt: NewAttempt) {
  return prisma.$transaction(async (tx) => {
    const lockKey = `attempts:${learnerId}:${attempt.courseId}:${attempt.stepId}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
    const existing = await tx.attempt.count({
      where: { learnerId, courseId: attempt.courseId, stepId: attempt.stepId },
    });
    return tx.attempt.create({
      data: { learnerId, ...attempt, attemptNumber: existing + 1 },
    });
  });
}

export async function markAttemptSynced(id: bigint): Promise<void> {
  await prisma.attempt.update({ where: { id }, data: { syncedAt: new Date() } });
}
