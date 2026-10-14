import { prisma } from './client.ts';

export interface NewFeedback {
  courseId: string;
  stepId: string;
  message: string;
}

export function createFeedback(learnerId: string, feedback: NewFeedback) {
  return prisma.feedback.create({ data: { learnerId, ...feedback } });
}

export async function markFeedbackEmailed(id: bigint): Promise<void> {
  await prisma.feedback.update({ where: { id }, data: { emailedAt: new Date() } });
}
