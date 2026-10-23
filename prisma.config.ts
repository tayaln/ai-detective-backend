// This file sits outside tsconfig.json's `src`, so the editor checks it without
// the project's Node types. Load them here.
/// <reference types="node" />
import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// The app loads .env with Node's --env-file; the Prisma CLI needs it loaded here.
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
