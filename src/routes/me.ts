import { Router } from 'express';
import { z } from 'zod';
import { PRESET_AVATAR_IDS } from '../lib/config.ts';
import { learnerIdOf, requireLearner } from '../middleware/require-learner.ts';
import { validate } from '../middleware/validate.ts';
import { getMe } from '../services/me.ts';
import { createProfile, updateProfile } from '../services/profile.ts';

// Plain text, never markup: it is shown in the header and goes into Saral's prompt.
const detectiveName = z.string().trim().min(1).max(24);
const avatarId = z.enum(PRESET_AVATAR_IDS);

// Unknown keys are dropped, so a soundOn or learner id sent here is ignored.
const createBody = z.object({ detectiveName, avatarId });
const updateBody = z
  .object({ detectiveName, avatarId, soundOn: z.boolean() })
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'send at least one field');

export const meRouter = Router();

meRouter.get('/me', requireLearner, async (req, res) => {
  res.json(await getMe(learnerIdOf(req)));
});

meRouter.post('/me/profile', requireLearner, validate({ body: createBody }), async (req, res) => {
  const body = req.body as z.infer<typeof createBody>;
  res.status(201).json({ profile: await createProfile(learnerIdOf(req), body) });
});

meRouter.put('/me/profile', requireLearner, validate({ body: updateBody }), async (req, res) => {
  const body = req.body as z.infer<typeof updateBody>;
  res.json({ profile: await updateProfile(learnerIdOf(req), body) });
});
