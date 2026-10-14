import { Router } from 'express';
import { z } from 'zod';
import { learnerIdOf, requireLearner } from '../middleware/require-learner.ts';
import { validate } from '../middleware/validate.ts';
import { completeStep, getAllCompletions, getCourseCompletions } from '../services/progress.ts';

// Content references, stored exactly as sent; the backend never checks them
// against the content or against each other.
const contentId = z.string().min(1).max(100);
const courseParams = z.object({ courseId: contentId });
const stepParams = z.object({ courseId: contentId, stepId: contentId });

export const progressRouter = Router();

progressRouter.get('/progress', requireLearner, async (req, res) => {
  res.json(await getAllCompletions(learnerIdOf(req)));
});

progressRouter.get(
  '/progress/:courseId',
  requireLearner,
  validate({ params: courseParams }),
  async (req, res) => {
    const { courseId } = req.params as z.infer<typeof courseParams>;
    res.json(await getCourseCompletions(learnerIdOf(req), courseId));
  },
);

// No body: the call itself means "this learner completed this step".
progressRouter.put(
  '/progress/:courseId/steps/:stepId',
  requireLearner,
  validate({ params: stepParams }),
  async (req, res) => {
    const { courseId, stepId } = req.params as z.infer<typeof stepParams>;
    await completeStep(learnerIdOf(req), courseId, stepId);
    res.json({ success: true });
  },
);
