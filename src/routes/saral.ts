import { Router } from 'express';
import { z } from 'zod';
import { learnerIdOf, requireLearner } from '../middleware/require-learner.ts';
import { validate } from '../middleware/validate.ts';
import { chatWithSaral } from '../services/saral.ts';

const chatBody = z.object({
  courseId: z.string().min(1).max(100),
  stepId: z.string().min(1).max(100),
  message: z.string().trim().min(1).max(1000),
});

export const saralRouter = Router();

saralRouter.post('/saral/chat', requireLearner, validate({ body: chatBody }), async (req, res) => {
  const { courseId, stepId, message } = req.body as z.infer<typeof chatBody>;
  const result = await chatWithSaral(learnerIdOf(req), courseId, stepId, message);
  res.json(result);
});
