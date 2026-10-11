import { Mastra } from '@mastra/core/mastra';
import { MastraStorageExporter, Observability } from '@mastra/observability';
import { PostgresStore } from '@mastra/pg';
import { metadataOnlyProcessor } from '@/lib/ai/observability/metadata-only-processor';

// Mastra storage lives in its own `mastra` schema, outside Prisma (sad.md §7, §11).
// The tables are created by `pnpm mastra:migrate`, never lazily on a request.
export const MASTRA_SCHEMA = 'mastra';

// ADR-0004: traces go only to Mastra storage (no third-party exporter), and every span
// passes the metadata-only processor first.
export const observability = new Observability({
  configs: {
    default: {
      serviceName: 'ai-assistant',
      exporters: [new MastraStorageExporter()],
      spanOutputProcessors: [metadataOnlyProcessor],
    },
  },
});

export const mastra = new Mastra({
  storage: new PostgresStore({
    id: 'mastra-storage',
    connectionString: process.env.DATABASE_URL ?? '',
    schemaName: MASTRA_SCHEMA,
    disableInit: true,
  }),
  observability,
});
