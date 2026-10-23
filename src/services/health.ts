import { checkDatabase } from '../db/health.ts';

export interface Health {
  status: 'ok';
  uptimeSeconds: number;
  database: 'ok';
}

/** Reports the application as healthy only when the database answers. */
export async function getHealth(): Promise<Health> {
  await checkDatabase();
  return {
    status: 'ok',
    uptimeSeconds: Math.round(process.uptime()),
    database: 'ok',
  };
}
