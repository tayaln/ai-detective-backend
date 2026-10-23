import { config } from '../lib/config.ts';
import { prisma } from './client.ts';

export interface NewSaralMessage {
  courseId: string;
  stepId: string;
  role: string;
  content: string;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedTokens: number | null;
}

export function createSaralMessages(learnerId: string, messages: NewSaralMessage[]) {
  return prisma.saralMessage.createMany({
    data: messages.map((m) => ({ learnerId, ...m })),
  });
}

export async function getRecentMessages(
  learnerId: string,
  courseId: string,
): Promise<{ role: string; content: string }[]> {
  const rows = await prisma.saralMessage.findMany({
    where: { learnerId, courseId },
    orderBy: { createdAt: 'desc' },
    take: config.SARAL_HISTORY_CAP,
    select: { role: true, content: true },
  });
  return rows.reverse();
}

export async function countTodayMessages(learnerId: string): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  return prisma.saralMessage.count({
    where: {
      learnerId,
      role: 'user',
      createdAt: { gte: startOfDay },
    },
  });
}
