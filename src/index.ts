import { createApp } from './app/app.ts';
import { startServer } from './app/server.ts';
import { prisma } from './db/client.ts';
import { config } from './lib/config.ts';
import { logEmailMode } from './lib/email.ts';

logEmailMode();
startServer(createApp(), config.PORT, {
  onShutdown: () => prisma.$disconnect(),
});
