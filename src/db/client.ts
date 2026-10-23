import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.ts';
import { config } from '../lib/config.ts';

const adapter = new PrismaPg({
  connectionString: config.DATABASE_URL,
  // pg waits forever for a connection by default; fail fast instead so
  // requests and the health check error out when the database is down.
  connectionTimeoutMillis: 5_000,
});

/** The one Prisma client for the whole application. */
export const prisma = new PrismaClient({ adapter });
