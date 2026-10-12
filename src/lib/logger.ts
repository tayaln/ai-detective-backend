import path from 'node:path';
import { pino, type StreamEntry } from 'pino';
import buildPinoRoll from 'pino-roll';
import { config } from './config.ts';

// Rotate at 10 MB and keep 10 old files, so logs stay under ~110 MB on disk.
const fileStream = await buildPinoRoll({
  file: path.join(config.LOG_DIR, 'app'),
  size: '10m',
  limit: { count: 10 },
  mkdir: true,
});

const streams: StreamEntry[] = [{ level: config.LOG_LEVEL, stream: fileStream }];
if (config.NODE_ENV !== 'production') {
  streams.push({ level: config.LOG_LEVEL, stream: process.stdout });
}

const destination = pino.multistream(streams);

export const logger = pino(
  {
    level: config.LOG_LEVEL,
    base: undefined,
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: { level: (label) => ({ level: label }) },
    // Keep an error's cause as a structured object, so fields such as a
    // driver's ECONNREFUSED code survive instead of being folded into text.
    serializers: { err: pino.stdSerializers.errWithCause },
    // Safety net only: request bodies, headers and query strings are never logged.
    redact: {
      paths: [
        'authorization',
        'email',
        'otp',
        'token',
        'password',
        'apiKey',
        '*.authorization',
        '*.email',
        '*.otp',
        '*.token',
        '*.password',
        '*.apiKey',
      ],
      censor: '[redacted]',
    },
  },
  destination,
);

/**
 * Writes any buffered lines to disk. Call before process.exit, or the last
 * lines are lost: logger.flush(cb) does not wait on a multistream.
 */
export function flushLogsSync(): void {
  destination.flushSync();
}
