import type { Express } from 'express';
import type { Server } from 'node:http';
import { flushLogsSync, logger } from '../lib/logger.ts';

/** How long in-flight requests get to finish before connections are cut. */
const SHUTDOWN_TIMEOUT_MS = 10_000;

export interface ServerOptions {
  /** Releases resources such as database connections once requests have finished. */
  onShutdown?: () => Promise<void>;
}

function exitAfterFlush(code: number): void {
  flushLogsSync();
  process.exit(code);
}

/**
 * Starts the HTTP server and installs process-level handlers: anything that
 * escapes is logged and the process exits, and SIGTERM or SIGINT stop new
 * connections while letting in-flight requests finish.
 */
export function startServer(app: Express, port: number, options: ServerOptions = {}): Server {
  // fatal() writes synchronously, so the line is on disk before the exit.
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception, exiting');
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    logger.fatal({ err: reason }, 'Unhandled promise rejection, exiting');
    process.exit(1);
  });

  const server = app.listen(port, () => {
    logger.info({ port }, 'Server listening');
  });

  let shuttingDown = false;
  const shutdown = (signal: NodeJS.Signals) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down, finishing in-flight requests');

    const forceTimer = setTimeout(() => {
      logger.warn('Shutdown timed out, closing remaining connections');
      server.closeAllConnections();
    }, SHUTDOWN_TIMEOUT_MS);
    forceTimer.unref();

    // close() stops accepting connections, drops idle keep-alive sockets and
    // calls back once every active request has been answered.
    server.close((closeErr) => {
      clearTimeout(forceTimer);
      void (async () => {
        let code = 0;
        if (closeErr) {
          logger.error({ err: closeErr }, 'Error while closing server');
          code = 1;
        }
        try {
          await options.onShutdown?.();
        } catch (err) {
          // Nothing awaits shutdown, so this is the only place it can be reported.
          logger.error({ err }, 'Error while releasing resources');
          code = 1;
        }
        logger.info('Shutdown complete');
        exitAfterFlush(code);
      })();
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  return server;
}
