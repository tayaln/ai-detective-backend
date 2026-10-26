import { config } from './config.ts';
import { AppError } from './errors.ts';
import { logger } from './logger.ts';
import { formatIstShort } from './time.ts';

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  /**
   * The HTML body, when the email needs formatting. Brevo takes one body type per
   * request, so with `html` it sends only the HTML; `text` is still what console mode
   * prints.
   */
  html?: string;
  /** Where a reply goes, when it should not go back to the sender account. */
  replyTo?: string;
}

/** "sent" only when Brevo accepted it; "console" when EMAIL_MODE kept it local. */
export type EmailOutcome = 'sent' | 'console';

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
export async function sendEmail(email: OutgoingEmail): Promise<EmailOutcome> {
  assertEmailCapacity();
  dailyCount.sent += 1;

  if (config.EMAIL_MODE === 'live') {
    await sendWithBrevo(email);
    logger.info('Email sent through Brevo');
    return 'sent';
  }

  logger.info('Email not sent: EMAIL_MODE is console');
  if (config.NODE_ENV !== 'production') {
    // The one place a sign-in code may appear, and only on the terminal.
    const replyTo = email.replyTo ? `\nReply-To: ${email.replyTo}` : '';
    process.stdout.write(
      `\n[email:console] To: ${email.to}${replyTo}\nSubject: ${email.subject}\n\n${email.text}\n\n`,
    );
  }
  return 'console';
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
      ...(email.replyTo && { replyTo: { email: email.replyTo } }),
      subject: email.subject,
      ...(email.html ? { htmlContent: email.html } : { textContent: email.text }),
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

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

/**
 * Short, with the code in the subject so it shows in the inbox list. Sent as HTML so the
 * code can be bold and indented; the plain text (the code indented with spaces) is what
 * the console prints when email stays local.
 */
export function signInCodeEmail(to: string, code: string, expiresInMinutes: number): OutgoingEmail {
  const intro = 'Your AI Detective sign-in code:';
  const lines = [
    `This code expires in ${expiresInMinutes} minutes and can be used once.`,
    "If you didn't try to sign in, you can ignore this email.",
    'Never share this code. AI Detective will never ask you for it.',
  ];
  return {
    to,
    subject: `${code} is your AI Detective sign-in code`,
    text: [intro, `    ${code}`, ...lines].join('\n\n'),
    html: [
      `<p>${escapeHtml(intro)}</p>`,
      `<p style="padding-left:24px"><strong>${escapeHtml(code)}</strong></p>`,
      ...lines.map((line) => `<p>${escapeHtml(line)}</p>`),
    ].join('\n'),
  };
}

export interface FeedbackNotice {
  to: string;
  learnerEmail: string;
  detectiveName: string | null;
  courseId: string;
  missionNumber: number;
  missionTitle: string;
  stepId: string;
  chapterNumber: number | null;
  stepTitle: string | null;
  pageUrl: string;
  message: string;
  receivedAt: Date;
}

/** One line of display text: client-supplied titles cannot break the subject or a header line. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Lines up the values of the details block: "Submitted:  " is the longest label. */
function detail(label: string, value: string): string {
  return `${`${label}:`.padEnd(12)}${value}`;
}

/**
 * Plain text only, so nothing in the message is ever interpreted as markup.
 * The subject names the mission and chapter so a full inbox stays scannable;
 * the learner's words come first, the details under a rule, and replies go
 * straight to the learner.
 */
export function feedbackEmail(notice: FeedbackNotice): OutgoingEmail {
  const missionTitle = oneLine(notice.missionTitle);
  const stepTitle = notice.stepTitle ? oneLine(notice.stepTitle) : null;
  const stepName = stepTitle ?? notice.stepId;
  const chapter =
    notice.chapterNumber === null
      ? stepName
      : `Chapter ${notice.chapterNumber}${stepTitle ? ` · ${stepTitle}` : ''}`;
  // "Mission 1 Ch2 — Read the AI's Response"; a step that is not a chapter has no "ChN".
  const subjectStep =
    notice.chapterNumber === null
      ? `Mission ${notice.missionNumber} — ${stepName}`
      : `Mission ${notice.missionNumber} Ch${notice.chapterNumber} — ${stepName}`;
  const name = notice.detectiveName ? oneLine(notice.detectiveName) : null;

  return {
    to: notice.to,
    replyTo: notice.learnerEmail,
    subject: `Feedback · ${subjectStep}`,
    text: [
      `Feedback: ${notice.message}`,
      '',
      '———',
      detail('Learner', name ? `${name} (${notice.learnerEmail})` : notice.learnerEmail),
      detail('Mission', `Mission ${notice.missionNumber} · ${missionTitle} (${notice.courseId})`),
      detail('Chapter', `${chapter} (${notice.stepId})`),
      detail('Submitted', formatIstShort(notice.receivedAt)),
      detail('Page', oneLine(notice.pageUrl)),
      '',
      'Reply to this email to answer the learner directly.',
    ].join('\n'),
  };
}
