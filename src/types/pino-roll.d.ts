declare module 'pino-roll' {
  import type { DestinationStream } from 'pino';

  interface PinoRollOptions {
    file: string | (() => string);
    size?: number | string;
    frequency?: 'daily' | 'hourly' | number;
    extension?: string;
    symlink?: boolean;
    mkdir?: boolean;
    dateFormat?: string;
    limit?: { count?: number; removeOtherLogFiles?: boolean };
  }

  export default function buildPinoRoll(
    options: PinoRollOptions,
  ): Promise<DestinationStream & { flushSync(): void }>;
}
