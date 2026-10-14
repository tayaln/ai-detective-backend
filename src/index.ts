import { createApp } from './app/app.ts';
import { startServer } from './app/server.ts';
import { prisma } from './db/client.ts';
import { config } from './lib/config.ts';
import { logEmailMode } from './lib/email.ts';
import { logSheetMode } from './lib/sheet.ts';

logEmailMode();
logSheetMode();
startServer(createApp(), config.PORT, {
  onShutdown: () => prisma.$disconnect(),
});
