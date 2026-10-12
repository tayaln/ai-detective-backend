import { config } from './config.ts';
import { AppError } from './errors.ts';
import { logger } from './logger.ts';

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
}

const BREVO_SEND_URL = 'https://api.brevo.com/v3/smtp/email';
const SEND_TIMEOUT_MS = 10_000;

// Kept in memory: the app is one process on one VM. A restart resets the count
// for the day, and Brevo's own account limit still applies behind it.
const dailyCount = { day: '', sent: 0 };

function sentToday(): number {
  const today = new Date().toISOString().slice(0, 10); // UTC day
  if (dailyCount.day !== today) {
    dailyCount.day = today;
    dailyCount.sent = 0;
  }
  return dailyCount.sent;
}

/** Throws a 503 once BREVO_DAILY_CAP emails have gone out today (UTC). */
export function assertEmailCapacity(): void {
  if (sentToday() >= config.BREVO_DAILY_CAP) {
    throw new AppError(
      503,
      'SERVICE_UNAVAILABLE',
      "We can't send emails right now. Please try again later.",
      {
        cause: new Error(
          `DAILY EMAIL CAP REACHED: ${config.BREVO_DAILY_CAP} emails sent today; refusing to send more until 00:00 UTC`,
        ),
      },
    );
  }
}

/**
 * Sends one email. In console mode nothing leaves the machine: outside
 * production the email is printed to the terminal, never to the log file.
 * Both modes count towards the daily cap, so it behaves the same everywhere.
 */
export async function sendEmail(email: OutgoingEmail): Promise<void> {
  assertEmailCapacity();
  dailyCount.sent += 1;

  if (config.EMAIL_MODE === 'live') {
    await sendWithBrevo(email);
    logger.info('Email sent through Brevo');
    return;
  }

  logger.info('Email not sent: EMAIL_MODE is console');
  if (config.NODE_ENV !== 'production') {
    // The one place a sign-in code may appear, and only on the terminal.
    process.stdout.write(
      `\n[email:console] To: ${email.to}\nSubject: ${email.subject}\n\n${email.text}\n\n`,
    );
  }
}

async function sendWithBrevo(email: OutgoingEmail): Promise<void> {
  const { BREVO_API_KEY, BREVO_SENDER_EMAIL, BREVO_SENDER_NAME } = config;
  if (!BREVO_API_KEY || !BREVO_SENDER_EMAIL || !BREVO_SENDER_NAME) {
    // Config validation requires these in live mode; this only satisfies the types.
    throw new Error('Brevo settings are missing');
  }

  const response = await fetch(BREVO_SEND_URL, {
    method: 'POST',
    headers: {
      'api-key': BREVO_API_KEY,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { email: BREVO_SENDER_EMAIL, name: BREVO_SENDER_NAME },
      to: [{ email: email.to }],
      subject: email.subject,
      textContent: email.text,
    }),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });

  if (!response.ok) {
    // Only Brevo's error code is kept: the body can echo addresses back.
    const body = (await response.json().catch(() => ({}))) as { code?: unknown };
    const code = typeof body.code === 'string' ? ` (${body.code})` : '';
    throw new Error(`Brevo rejected the email: HTTP ${response.status}${code}`);
  }
}

export function logEmailMode(): void {
  const dailyCap = config.BREVO_DAILY_CAP;
  if (config.EMAIL_MODE === 'live') {
    logger.warn({ emailMode: 'live', dailyCap }, 'Email mode: live, sending through Brevo');
  } else {
    logger.info({ emailMode: 'console', dailyCap }, 'Email mode: console, nothing is sent');
  }
  if (config.EMAIL_MODE_UNRECOGNISED) {
    logger.warn('EMAIL_MODE is not "live" or "console"; using console');
  }
}
