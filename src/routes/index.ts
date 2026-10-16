import { Router } from 'express';
import { attemptsRouter } from './attempts.ts';
import { authRouter } from './auth.ts';
import { feedbackRouter } from './feedback.ts';
import { healthRouter } from './health.ts';
import { meRouter } from './me.ts';
import { progressRouter } from './progress.ts';
import { saralRouter } from './saral.ts';

export const apiRouter = Router();

apiRouter.use(healthRouter);
apiRouter.use(authRouter);
apiRouter.use(meRouter);
apiRouter.use(progressRouter);
apiRouter.use(attemptsRouter);
apiRouter.use(feedbackRouter);
apiRouter.use(saralRouter);
