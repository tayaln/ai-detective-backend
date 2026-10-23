import type { OutgoingEmail } from './email.ts';
import { formatIstShort } from './time.ts';

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
