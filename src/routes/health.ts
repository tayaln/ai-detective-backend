import { Router } from 'express';
import { getHealth } from '../services/health.ts';

export const healthRouter = Router();

healthRouter.get('/health', async (_req, res) => {
  res.json(await getHealth());
});
