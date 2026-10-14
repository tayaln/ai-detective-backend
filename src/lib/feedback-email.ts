import type { OutgoingEmail } from './email.ts';
import { formatIst } from './time.ts';

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

/**
 * Plain text only, so nothing in the message is ever interpreted as markup.
 * The subject names the mission and chapter so a full inbox stays scannable,
 * and replies go straight to the learner.
 */
export function feedbackEmail(notice: FeedbackNotice): OutgoingEmail {
  const mission = `Mission ${notice.missionNumber} · ${oneLine(notice.missionTitle)}`;
  const stepTitle = notice.stepTitle ? oneLine(notice.stepTitle) : null;
  const step =
    notice.chapterNumber === null
      ? (stepTitle ?? notice.stepId)
      : `Chapter ${notice.chapterNumber}${stepTitle ? ` · ${stepTitle}` : ''}`;

  return {
    to: notice.to,
    replyTo: notice.learnerEmail,
    subject: `AI Detective Application Feedback: ${mission} — ${step}`,
    text: [
      'New chapter feedback from AI Detective.',
      '',
      `Email:     ${notice.learnerEmail}`,
      `Mission:   ${mission} (${notice.courseId})`,
      `Chapter:   ${step} (${notice.stepId})`,
      `Page:      ${oneLine(notice.pageUrl)}`,
      `Received:  ${formatIst(notice.receivedAt)}`,
      '',
      'Message:',
      '',
      notice.message,
      '',
      '—',
      'Reply to this email to answer the learner directly.',
    ].join('\n'),
  };
}
