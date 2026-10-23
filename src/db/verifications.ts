import { prisma } from './client.ts';

/** Removes one sign-in code row, leaving any older code for the same email in place. */
export async function deleteVerification(id: string): Promise<void> {
  await prisma.verification.deleteMany({ where: { id } });
}
