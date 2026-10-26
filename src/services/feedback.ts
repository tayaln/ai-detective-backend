import { createFeedback, markFeedbackEmailed, type NewFeedback } from '../db/feedback.ts';
import { findLearnerContact } from '../db/learners.ts';
import { config } from '../lib/config.ts';
import { feedbackEmail, sendEmail } from '../lib/email.ts';
import { logger } from '../lib/logger.ts';

type SavedFeedback = Awaited<ReturnType<typeof createFeedback>>;

/** Display details from the screen the learner was on; used only in the email. */
export interface FeedbackContext {
  missionNumber: number;
  missionTitle: string;
  chapterNumber: number | null;
  stepTitle: string | null;
  pageUrl: string;
}

/** Saves the feedback. The database is the record; the email is only a notification. */
export function saveFeedback(learnerId: string, feedback: NewFeedback): Promise<SavedFeedback> {
  return createFeedback(learnerId, feedback);
}

/**
 * Emails the client about saved feedback, then stamps emailed_at — only after a
 * real send, so console mode never claims a notification went out. Runs after
 * the response has gone, so nothing is listening: it catches everything and logs
 * one line, never the learner's address.
 */
export function notifyFeedback(feedback: SavedFeedback, context: FeedbackContext): void {
  void (async () => {
    try {
      const recipient = config.FEEDBACK_RECIPIENT_EMAIL;
      if (!recipient) {
        throw new Error('FEEDBACK_RECIPIENT_EMAIL is not set');
      }
      const learner = await findLearnerContact(feedback.learnerId);
      if (!learner) {
        throw new Error('Learner not found');
      }
      const outcome = await sendEmail(
        feedbackEmail({
          to: recipient,
          learnerEmail: learner.email,
          detectiveName: learner.profile?.detectiveName ?? null,
          courseId: feedback.courseId,
          stepId: feedback.stepId,
          message: feedback.message,
          receivedAt: feedback.createdAt,
          ...context,
        }),
      );
      if (outcome === 'sent') {
        await markFeedbackEmailed(feedback.id);
      }
    } catch (err) {
      logger.error(
        { err, feedbackId: String(feedback.id) },
        'Feedback notification not sent; emailed_at left empty',
      );
    }
  })();
}
