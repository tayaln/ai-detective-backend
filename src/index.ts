import { createApp } from './app/app.ts';
import { startServer } from './app/server.ts';
import { prisma } from './db/client.ts';
import { config } from './lib/config.ts';
import { loadContent } from './lib/content.ts';
import { logEmailMode } from './lib/email.ts';
import { logger } from './lib/logger.ts';
import { logSheetMode } from './lib/sheet.ts';

logger.info({ missions: loadContent() }, 'Course content loaded');
logEmailMode();
logSheetMode();
startServer(createApp(), config.PORT, {
  onShutdown: () => prisma.$disconnect(),
});
