import { createAttempt, markAttemptSynced, type NewAttempt } from '../db/attempts.ts';
import { findLearnerContact } from '../db/learners.ts';
import { config } from '../lib/config.ts';
import { logger } from '../lib/logger.ts';
import { appendSheetRow, isSheetSyncEnabled } from '../lib/sheet.ts';
import { formatIst } from '../lib/time.ts';

type SavedAttempt = Awaited<ReturnType<typeof createAttempt>>;

/**
 * Records one chapter submission or quiz attempt. The answer is stored as sent,
 * and the attempt number always comes from the rows already saved.
 */
export function recordAttempt(learnerId: string, attempt: NewAttempt): Promise<SavedAttempt> {
  return createAttempt(learnerId, attempt);
}

/**
 * Copies the attempt to the client's sheet, then stamps synced_at. Runs after
 * the response has gone, so nothing is listening: it catches everything and
 * logs one line when it gives up. A row left with synced_at empty can be found
 * and filled later.
 */
export function syncAttemptToSheet(attempt: SavedAttempt): void {
  if (!isSheetSyncEnabled()) {
    return;
  }
  void (async () => {
    try {
      const learner = await findLearnerContact(attempt.learnerId);
      await appendSheetRow({
        attemptId: String(attempt.id),
        timestamp: formatIst(attempt.createdAt),
        learner: learner?.email ?? attempt.learnerId,
        mission: attempt.courseId,
        step: attempt.stepId,
        type: attempt.stepType,
        attemptNumber: attempt.attemptNumber,
        correct: attempt.isCorrect,
        score: attempt.score,
        submittedAnswer: attempt.submittedAnswer,
      });
      await markAttemptSynced(attempt.id);
    } catch (err) {
      logger.error(
        { err, attemptId: String(attempt.id), sheetUrl: config.GOOGLE_SHEET_URL },
        'Attempt not synced to the sheet; synced_at left empty',
      );
    }
  })();
}
