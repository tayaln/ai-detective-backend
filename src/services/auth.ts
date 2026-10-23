import { APIError } from 'better-auth/api';
import { deleteVerification } from '../db/verifications.ts';
import {
  auth,
  AUTH_TOKEN_HEADER,
  OTP_ALLOWED_ATTEMPTS,
  OTP_EXPIRES_IN_MINUTES,
} from '../lib/auth.ts';
import { assertEmailCapacity, sendEmail } from '../lib/email.ts';
import { AppError } from '../lib/errors.ts';
import { signInCodeEmail } from '../lib/otp-email.ts';

const TOO_MANY_ATTEMPTS_MESSAGE = 'Too many wrong attempts for this code. Request a new one.';

/** Better Auth error codes for a bad sign-in code, mapped to our own. */
function translateAuthError(err: unknown): unknown {
  if (!(err instanceof APIError)) {
    return err;
  }
  const code = (err.body as { code?: unknown } | undefined)?.code;
  switch (code) {
    case 'INVALID_OTP':
      return new AppError(400, 'INVALID_CODE', 'That code is not correct.', { cause: err });
    case 'OTP_EXPIRED':
      return new AppError(400, 'CODE_EXPIRED', 'That code has expired. Request a new one.', {
        cause: err,
      });
    case 'TOO_MANY_ATTEMPTS':
      return new AppError(400, 'TOO_MANY_ATTEMPTS', TOO_MANY_ATTEMPTS_MESSAGE, { cause: err });
  }
  if (err.statusCode >= 400 && err.statusCode < 500) {
    return new AppError(400, 'INVALID_INPUT', err.message, { cause: err });
  }
  return err;
}

/** Bearer only: cookies are never passed to Better Auth, so they never authenticate. */
function bearerHeaders(authorization: string): Headers {
  return new Headers({ authorization });
}

/** The email's newest sign-in code row, as Better Auth stores it. */
async function currentCodeRow(email: string) {
  const { internalAdapter } = await auth.$context;
  return internalAdapter.findVerificationValue(`sign-in-otp-${email.toLowerCase()}`);
}

/**
 * Wrong tries recorded against the email's current code. Better Auth stores the
 * count after the last colon of the verification value ("<hashed code>:<count>").
 */
async function wrongAttemptsSoFar(email: string): Promise<number> {
  const row = await currentCodeRow(email);
  const count = row?.value.slice(row.value.lastIndexOf(':') + 1);
  return Number(count) || 0;
}

/**
 * A wrong code, told apart by how many tries are left. Better Auth only refuses
 * a locked code on the try after the last one, so the try that uses up the
 * budget is reported as the lock here.
 */
async function wrongCodeError(email: string, cause: unknown): Promise<AppError> {
  const remaining = OTP_ALLOWED_ATTEMPTS - (await wrongAttemptsSoFar(email));
  if (remaining <= 0) {
    return new AppError(400, 'TOO_MANY_ATTEMPTS', TOO_MANY_ATTEMPTS_MESSAGE, { cause });
  }
  if (remaining === 1) {
    return new AppError(
      400,
      'INVALID_CODE_LAST_ATTEMPT',
      'That code is not correct. One attempt left before it locks.',
      { cause },
    );
  }
  return new AppError(400, 'INVALID_CODE', 'That code is not correct.', { cause });
}

/**
 * Creates the code and emails it. Sent here rather than through Better Auth's
 * email hook, which swallows a failed send and still reports success.
 */
export async function requestSignInCode(email: string): Promise<void> {
  const address = email.toLowerCase();
  // Before a code is created, so a refused send leaves no code behind.
  assertEmailCapacity();
  let otp: string;
  try {
    otp = await auth.api.createVerificationOTP({ body: { email: address, type: 'sign-in' } });
  } catch (err) {
    throw translateAuthError(err);
  }
  try {
    await sendEmail(signInCodeEmail(address, otp, OTP_EXPIRES_IN_MINUTES));
  } catch (err) {
    // The newest code is checked first, so an undelivered one would block a
    // code the learner already has. Remove it.
    const undelivered = await currentCodeRow(address);
    if (undelivered) {
      await deleteVerification(undelivered.id);
    }
    if (err instanceof AppError) {
      throw err;
    }
    throw new AppError(
      503,
      'SERVICE_UNAVAILABLE',
      "We couldn't send your sign-in code. Please try again in a few minutes.",
      { cause: err },
    );
  }
}

/** Verifies the code, creating the learner on first sign-in, and returns the bearer token. */
export async function verifySignInCode(email: string, otp: string): Promise<string> {
  let headers: Headers;
  try {
    ({ headers } = await auth.api.signInEmailOTP({ body: { email, otp }, returnHeaders: true }));
  } catch (err) {
    const translated = translateAuthError(err);
    if (translated instanceof AppError && translated.code === 'INVALID_CODE') {
      throw await wrongCodeError(email, err);
    }
    throw translated;
  }
  const token = headers.get(AUTH_TOKEN_HEADER);
  if (!token) {
    throw new Error(`Better Auth did not return a ${AUTH_TOKEN_HEADER} header`);
  }
  return token;
}

/** Resolves the learner id for a bearer token, or null if it is missing, invalid or revoked. */
export async function findLearnerIdForToken(
  authorization: string | undefined,
): Promise<string | null> {
  if (!authorization) {
    return null;
  }
  const session = await auth.api.getSession({ headers: bearerHeaders(authorization) });
  return session?.user.id ?? null;
}

/**
 * Deletes the session row for this token only; other devices stay signed in.
 * A missing or already-invalid token is treated as already signed out.
 */
export async function signOut(authorization: string | undefined): Promise<void> {
  if (!authorization) {
    return;
  }
  try {
    await auth.api.signOut({ headers: bearerHeaders(authorization) });
  } catch (err) {
    if (err instanceof APIError && err.statusCode < 500) {
      return;
    }
    throw err;
  }
}
