import { setTimeout as sleep } from 'node:timers/promises';
import { config } from './config.ts';
import { logger } from './logger.ts';

/** One attempt as it lands in the client's sheet, in column order. */
export interface SheetRow {
  /**
   * The attempt's row id. Not a column: the script uses it to skip a row it
   * has already written, so a retry after a lost reply adds no duplicate.
   */
  attemptId: string;
  /** IST, formatted text; the sheet never converts it. */
  timestamp: string;
  /** The learner's email address. */
  learner: string;
  mission: string;
  step: string;
  type: string;
  attemptNumber: number;
  correct: boolean;
  score: number | null;
  submittedAnswer: string;
}

// Longer than the script's 20s lock wait plus a cold start. Giving up sooner
// does not stop the script, which then writes the row the retry writes again.
const REQUEST_TIMEOUT_MS = 30_000;
/** Waits before the second and third tries. */
const RETRY_DELAYS_MS = [1_000, 3_000];

export function isSheetSyncEnabled(): boolean {
  return config.GOOGLE_SCRIPT_URL !== undefined;
}

/**
 * Appends one row through the Apps Script web app. Retries, then throws a
 * reason that never contains the script URL, which is a credential.
 */
export async function appendSheetRow(row: SheetRow): Promise<void> {
  const url = config.GOOGLE_SCRIPT_URL;
  if (!url) {
    throw new Error('GOOGLE_SCRIPT_URL is not set');
  }

  let reason = '';
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    if (attempt > 0) {
      await sleep(RETRY_DELAYS_MS[attempt - 1]);
    }
    reason = await tryAppend(url, row);
    if (!reason) {
      return;
    }
    if (attempt < RETRY_DELAYS_MS.length) {
      logger.warn({ attemptId: row.attemptId, reason }, 'Sheet append try failed; retrying');
    }
  }
  throw new Error(`Sheet append failed after ${RETRY_DELAYS_MS.length + 1} tries: ${reason}`);
}

/** One try. Returns an empty string on success, otherwise a URL-free reason. */
async function tryAppend(url: string, row: SheetRow): Promise<string> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(row),
      // Apps Script answers with a redirect to script.googleusercontent.com,
      // which serves the script's reply. Not following it reports a false failure.
      redirect: 'follow',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      return `HTTP ${response.status}`;
    }
    // Apps Script cannot set a status code, so the script reports in its body.
    const body = (await response.json().catch(() => null)) as { ok?: unknown } | null;
    return body?.ok === true ? '' : 'the script did not confirm the append';
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      return `no reply within ${REQUEST_TIMEOUT_MS / 1000}s`;
    }
    // The URL's path and query hold the deployment id and key, so a cause's
    // message is used only when it cannot contain them.
    const cause = (err as { cause?: { code?: unknown; message?: unknown } }).cause;
    if (typeof cause?.code === 'string') {
      return cause.code;
    }
    if (typeof cause?.message === 'string' && !/[/?]/.test(cause.message)) {
      return cause.message;
    }
    return err instanceof Error ? err.name : 'unknown error';
  }
}

export function logSheetMode(): void {
  if (isSheetSyncEnabled()) {
    logger.info({ sheetUrl: config.GOOGLE_SHEET_URL }, 'Sheet sync: on');
  } else {
    logger.warn('Sheet sync: off, GOOGLE_SCRIPT_URL is not set; attempts are saved but not synced');
  }
}
