import { AppError } from '../lib/errors.ts';
import { prisma } from './client.ts';

/** Throws a 503 if the database cannot answer a trivial query. */
export async function checkDatabase(): Promise<void> {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    throw new AppError(503, 'SERVICE_UNAVAILABLE', 'Database is unreachable', { cause: err });
  }
}
