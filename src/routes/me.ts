import { Router } from 'express';
import { learnerIdOf, requireLearner } from '../middleware/require-learner.ts';
import { getMe } from '../services/me.ts';

export const meRouter = Router();

meRouter.get('/me', requireLearner, async (req, res) => {
  res.json(await getMe(learnerIdOf(req)));
});
