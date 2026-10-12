import { Router } from 'express';
import { z } from 'zod';
import { AUTH_TOKEN_HEADER } from '../lib/auth.ts';
import { rateLimit } from '../middleware/rate-limit.ts';
import { validate } from '../middleware/validate.ts';
import { requestSignInCode, signOut, verifySignInCode } from '../services/auth.ts';

const FIFTEEN_MINUTES = 15 * 60 * 1000;

const email = z.string().trim().pipe(z.email().max(254));
const requestBody = z.object({ email });
const verifyBody = z.object({
  email,
  otp: z.string().regex(/^\d{6}$/, 'must be the 6-digit code'),
});

// Per IP, generous enough for a classroom behind one address.
const requestLimitByIp = rateLimit({ windowMs: FIFTEEN_MINUTES, limit: 20 });
// Per address, so one inbox cannot be flooded from many IPs. Runs after validation.
const requestLimitByEmail = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: 3,
  keyGenerator: (req) => `email:${(req.body as z.infer<typeof requestBody>).email.toLowerCase()}`,
  message: 'Too many codes requested for this email. Please wait 15 minutes and try again.',
});
// Each code also locks after 5 wrong tries; this caps guessing across codes.
const verifyLimitByIp = rateLimit({ windowMs: FIFTEEN_MINUTES, limit: 30 });

export const authRouter = Router();

authRouter.post(
  '/auth/otp/request',
  requestLimitByIp,
  validate({ body: requestBody }),
  requestLimitByEmail,
  async (req, res) => {
    const { email } = req.body as z.infer<typeof requestBody>;
    await requestSignInCode(email);
    res.json({ success: true });
  },
);

authRouter.post(
  '/auth/otp/verify',
  verifyLimitByIp,
  validate({ body: verifyBody }),
  async (req, res) => {
    const { email, otp } = req.body as z.infer<typeof verifyBody>;
    const token = await verifySignInCode(email, otp);
    res.setHeader(AUTH_TOKEN_HEADER, token);
    res.json({ token });
  },
);

authRouter.post('/auth/signout', async (req, res) => {
  await signOut(req.headers.authorization);
  res.json({ success: true });
});
