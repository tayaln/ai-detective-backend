import type { Logger } from 'pino';

declare global {
  namespace Express {
    interface Request {
      /** Generated per request; returned in X-Request-Id and every error response. */
      id: string;
      /** Logger bound to this request's id. */
      log: Logger;
      /** Set by requireLearner; read it with learnerIdOf(req). */
      learnerId?: string;
    }
  }
}

export {};
