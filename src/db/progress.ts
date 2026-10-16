import { prisma } from './client.ts';

/**
 * Records that the learner completed a step (moved on from it, answered a chapter
 * correctly, or submitted a quiz), in one transaction:
 * - the completion: INSERT ... ON CONFLICT DO NOTHING, so the first call
 *   creates the row and a repeat leaves the original completed_at untouched
 * - the position: the mission's last step completed, overwritten every time
 */
export async function markStepCompleted(
  learnerId: string,
  courseId: string,
  stepId: string,
): Promise<void> {
  await prisma.$transaction([
    prisma.courseStepCompletion.createMany({
      data: [{ learnerId, courseId, stepId }],
      skipDuplicates: true,
    }),
    prisma.coursePosition.upsert({
      where: { learnerId_courseId: { learnerId, courseId } },
      create: { learnerId, courseId, stepId },
      update: { stepId },
    }),
  ]);
}

/** The last step moved on from in each mission, optionally for one course. */
export function findPositions(learnerId: string, courseId?: string) {
  return prisma.coursePosition.findMany({
    where: { learnerId, ...(courseId !== undefined && { courseId }) },
    select: { courseId: true, stepId: true },
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
