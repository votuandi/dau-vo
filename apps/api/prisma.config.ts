import process from 'node:process';

import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Generate/typecheck do not require a live database. Commands that do need
    // one load the monorepo-root .env in their package scripts.
    url: process.env.DATABASE_URL ?? '',
  },
});
