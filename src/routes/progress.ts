import { Router } from 'express';
import { z } from 'zod';
import { learnerIdOf, requireLearner } from '../middleware/require-learner.ts';
import { validate } from '../middleware/validate.ts';
import { completeStep, getAllProgress, getCourseProgress } from '../services/progress.ts';

// Content references; the service checks them against the loaded content.
const contentId = z.string().min(1).max(100);
const courseParams = z.object({ courseId: contentId });
const stepParams = z.object({ courseId: contentId, stepId: contentId });

export const progressRouter = Router();

progressRouter.get('/progress', requireLearner, async (req, res) => {
  res.json(await getAllProgress(learnerIdOf(req)));
});

progressRouter.get(
  '/progress/:courseId',
  requireLearner,
  validate({ params: courseParams }),
  async (req, res) => {
    const { courseId } = req.params as z.infer<typeof courseParams>;
    res.json(await getCourseProgress(learnerIdOf(req), courseId));
  },
);

// No body: the call itself means "this learner completed this step". Replies
// with the mission's progress after it.
progressRouter.put(
  '/progress/:courseId/steps/:stepId',
  requireLearner,
  validate({ params: stepParams }),
  async (req, res) => {
    const { courseId, stepId } = req.params as z.infer<typeof stepParams>;
    res.json(await completeStep(learnerIdOf(req), courseId, stepId));
  },
);
