import { prisma } from './client.ts';

/**
 * Records that the learner completed a step: one INSERT ... ON CONFLICT DO
 * NOTHING. The first call creates the row; a repeat leaves the original
 * completed_at untouched. No read beforehand.
 */
export async function markStepCompleted(
  learnerId: string,
  courseId: string,
  stepId: string,
): Promise<void> {
  await prisma.courseStepCompletion.createMany({
    data: [{ learnerId, courseId, stepId }],
    skipDuplicates: true,
  });
}

/** The learner's completions, in the order they happened, optionally for one course. */
export function findCompletions(learnerId: string, courseId?: string) {
  return prisma.courseStepCompletion.findMany({
    where: { learnerId, ...(courseId !== undefined && { courseId }) },
    select: { courseId: true, stepId: true, completedAt: true },
    orderBy: [{ completedAt: 'asc' }, { stepId: 'asc' }],
  });
}
