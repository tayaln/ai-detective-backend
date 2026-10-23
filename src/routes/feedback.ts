import { Router } from 'express';
import { z } from 'zod';
import { learnerIdOf, requireLearner } from '../middleware/require-learner.ts';
import { rateLimit } from '../middleware/rate-limit.ts';
import { validate } from '../middleware/validate.ts';
import { notifyFeedback, saveFeedback } from '../services/feedback.ts';

const ONE_HOUR = 60 * 60 * 1000;

const contentId = z.string().min(1).max(100);
const displayText = z.string().min(1).max(200);

// Matches the frontend's feedback-schema.ts. Its `learner` block and `sentAt`
// are dropped as unknown keys: the learner comes from the session and the time
// is the server's own.
const feedbackBody = z.object({
  // Plain text, never markup.
  message: z.string().trim().min(1).max(2000),
  context: z.object({
    courseId: contentId,
    missionNumber: z.int().positive(),
    missionTitle: displayText,
    stepId: contentId,
    chapterNumber: z.int().positive().nullable(),
    stepTitle: displayText.nullable(),
    pageUrl: z.url({ protocol: /^https?$/ }).max(2000),
  }),
});

// Per learner: feedback shares Brevo's daily allowance with sign-in codes.
const feedbackLimitByLearner = rateLimit({
  windowMs: ONE_HOUR,
  limit: 5,
  keyGenerator: (req) => `learner:${learnerIdOf(req)}`,
  message: 'Thanks — that is a lot of feedback for one hour. Please try again later.',
});

export const feedbackRouter = Router();

feedbackRouter.post(
  '/feedback',
  requireLearner,
  feedbackLimitByLearner,
  validate({ body: feedbackBody }),
  async (req, res) => {
    const { message, context } = req.body as z.infer<typeof feedbackBody>;
    const { courseId, stepId, ...display } = context;
    const feedback = await saveFeedback(learnerIdOf(req), { courseId, stepId, message });
    res.status(201).json({ success: true });
    // After the response: the email never delays or fails the request.
    notifyFeedback(feedback, display);
  },
);
