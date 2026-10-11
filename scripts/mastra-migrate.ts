// Creates the Mastra storage tables in the `mastra` schema (sad.md §7, §11). Idempotent; run beside
// `prisma migrate deploy`. Prisma never sees this schema.
//   pnpm mastra:migrate        # DATABASE_URL from .env (check the host first)
import { PostgresStore } from '@mastra/pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const store = new PostgresStore({ id: 'mastra-migrate', connectionString, schemaName: 'mastra' });
try {
  await store.init();
  console.log('mastra schema is up to date');
} finally {
  await store.close();
}
