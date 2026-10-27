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
  thinkingTokens: number | null;
}

/**
 * Saves the learner's message before the model is called, so it counts towards
 * the daily limit while the reply is pending. A transaction-scoped advisory
 * lock on the learner makes concurrent requests count and insert in turn.
 * Returns the row id, or null when the limit is already reached.
 */
export function reserveUserMessage(
  learnerId: string,
  message: Pick<NewSaralMessage, 'courseId' | 'stepId' | 'content'>,
  dailyLimit: number,
): Promise<bigint | null> {
  return prisma.$transaction(async (tx) => {
    const lockKey = `saral:${learnerId}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const today = await tx.saralMessage.count({
      where: { learnerId, role: 'user', createdAt: { gte: startOfDay } },
    });
    if (today >= dailyLimit) {
      return null;
    }
    const row = await tx.saralMessage.create({
      data: { learnerId, role: 'user', ...message },
      select: { id: true },
    });
    return row.id;
  });
}

/** Adds the usage to the reserved message and stores Saral's reply. */
export function completeExchange(
  learnerId: string,
  userMessageId: bigint,
  usage: Pick<NewSaralMessage, 'inputTokens' | 'cachedTokens'>,
  reply: NewSaralMessage,
) {
  return prisma.$transaction([
    prisma.saralMessage.update({ where: { id: userMessageId }, data: usage }),
    prisma.saralMessage.create({ data: { learnerId, ...reply } }),
  ]);
}

/** Removes a reserved message whose reply never came, so it is not replayed as history. */
export async function deleteSaralMessage(id: bigint): Promise<void> {
  await prisma.saralMessage.delete({ where: { id } });
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
