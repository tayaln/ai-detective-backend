import { createApp } from './app/app.ts';
import { startServer } from './app/server.ts';
import { prisma } from './db/client.ts';
import { config } from './lib/config.ts';
import { loadContent } from './lib/content.ts';
import { logEmailMode } from './lib/email.ts';
import { logger } from './lib/logger.ts';
import { loadSaralContent } from './lib/saral-content.ts';
import { logSheetMode } from './lib/sheet.ts';
import { shutdownTracing, startTracing } from './lib/tracing.ts';

logger.info({ missions: loadContent() }, 'Course content loaded');
logger.info({ missions: loadSaralContent() }, 'Saral content loaded');
logEmailMode();
logSheetMode();
startTracing();
startServer(createApp(), config.PORT, {
  onShutdown: async () => {
    try {
      await shutdownTracing();
    } finally {
      await prisma.$disconnect();
    }
  },
});
