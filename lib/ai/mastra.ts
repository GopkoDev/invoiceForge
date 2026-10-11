import { Mastra } from '@mastra/core/mastra';
import { PostgresStore } from '@mastra/pg';

// Mastra storage lives in its own `mastra` schema, outside Prisma (sad.md §7, §11).
// The tables are created by `pnpm mastra:migrate`, never lazily on a request.
export const MASTRA_SCHEMA = 'mastra';

export const mastra = new Mastra({
  storage: new PostgresStore({
    id: 'mastra-storage',
    connectionString: process.env.DATABASE_URL ?? '',
    schemaName: MASTRA_SCHEMA,
    disableInit: true,
  }),
});
