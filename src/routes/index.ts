import { Router } from 'express';
import { authRouter } from './auth.ts';
import { healthRouter } from './health.ts';
import { meRouter } from './me.ts';

export const apiRouter = Router();

apiRouter.use(healthRouter);
apiRouter.use(authRouter);
apiRouter.use(meRouter);
