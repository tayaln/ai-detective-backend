import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { bearer, emailOTP } from 'better-auth/plugins';
import { prisma } from '../db/client.ts';
import { createEmptyProfile } from '../db/profiles.ts';
import { config } from './config.ts';

const DAY_SECONDS = 60 * 60 * 24;
export const OTP_EXPIRES_IN_MINUTES = 10;
/** Wrong tries a code survives; the one that reaches this number locks it. */
export const OTP_ALLOWED_ATTEMPTS = 5;

/**
 * Header the bearer plugin uses to return the session token after sign-in.
 * The frontend reads the token from here; Better Auth sets no cookie for us.
 */
export const AUTH_TOKEN_HEADER = 'set-auth-token';

export const auth = betterAuth({
  baseURL: config.BETTER_AUTH_URL,
  secret: config.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  session: {
    expiresIn: 30 * DAY_SECONDS,
    // Any use more than a day after the last refresh pushes expiry forward.
    updateAge: DAY_SECONDS,
  },
  databaseHooks: {
    user: {
      create: {
        // Every learner has a profile row from the moment they exist.
        after: async (user) => {
          await createEmptyProfile(user.id, user.email);
        },
      },
    },
  },
  plugins: [
    emailOTP({
      expiresIn: OTP_EXPIRES_IN_MINUTES * 60,
      storeOTP: 'hashed',
      // Five wrong tries lock the code; after that even the right code fails.
      allowedAttempts: OTP_ALLOWED_ATTEMPTS,
      // Required by the plugin but never called: Better Auth swallows anything
      // thrown here and still reports success, so a failed send would look like
      // a sent code. services/auth.ts creates the code and sends it itself.
      sendVerificationOTP: () => {
        throw new Error('Sign-in codes are sent by services/auth.ts, not this hook');
      },
    }),
    // Only the signed token we issue is accepted; the bare session token, which
    // is stored in plain text in the session table, is refused.
    bearer({ requireSignature: true }),
  ],
});
