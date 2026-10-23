import { Router } from 'express';
import { z } from 'zod';
import { learnerIdOf, requireLearner } from '../middleware/require-learner.ts';
import { rateLimit } from '../middleware/rate-limit.ts';
import { validate } from '../middleware/validate.ts';
import { recordAttempt, syncAttemptToSheet } from '../services/attempts.ts';

const ONE_MINUTE = 60 * 1000;

const contentId = z.string().min(1).max(100);

// Unknown keys are dropped: an attempt number or learner id sent here is ignored.
const attemptBody = z.object({
  courseId: contentId,
  stepId: contentId,
  stepType: z.enum(['chapter', 'quiz']),
  // Opaque text, stored exactly as sent: never trimmed, parsed or reformatted.
  submittedAnswer: z.string().min(1).max(10_000),
  // Decided in the browser; the server does no scoring.
  isCorrect: z.boolean(),
  score: z.number().int().min(0).max(100).nullable().default(null),
});

// Per learner, generous for someone retrying a chapter; caps sheet writes.
const attemptLimitByLearner = rateLimit({
  windowMs: ONE_MINUTE,
  limit: 30,
  keyGenerator: (req) => `learner:${learnerIdOf(req)}`,
  message: 'Too many submissions. Please wait a minute and try again.',
});

export const attemptsRouter = Router();

attemptsRouter.post(
  '/attempts',
  requireLearner,
  attemptLimitByLearner,
  validate({ body: attemptBody }),
  async (req, res) => {
    const body = req.body as z.infer<typeof attemptBody>;
    const attempt = await recordAttempt(learnerIdOf(req), body);
    res.status(201).json({ attemptNumber: attempt.attemptNumber });
    // After the response: the sheet never delays or fails the request.
    syncAttemptToSheet(attempt);
  },
);
