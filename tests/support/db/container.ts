// One throwaway Postgres container per suite (test-plan.md §Test data). Applies the repo's
// Prisma migrations (`prisma/migrations/`) via `prisma migrate deploy`. Staged migrations under
// docs/features/architecture-hardening/migrations/ are NOT applied here: they are plain SQL
// files outside Prisma's migration folder format, and each task promotes its own staged
// migration into `prisma/migrations/<timestamp>_<name>/migration.sql` when it ships. Once
// promoted, `prisma migrate deploy` (below) picks it up automatically - no harness change
// needed.

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { assertNotEnvDatabase } from './env-guard';

export interface TestDatabase {
  connectionString: string;
  container: StartedPostgreSqlContainer;
  stop(): Promise<void>;
}

export async function startTestDatabase(): Promise<TestDatabase> {
  const container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('invoice_forge_test')
    .withUsername('test')
    .withPassword('test')
    .start();

  const connectionString = container.getConnectionUri();

  // Belt and braces: a fresh container URI can never equal the real .env URL, but every path
  // that touches a real connection string runs this guard, no exceptions.
  assertNotEnvDatabase(connectionString);

  applyMigrations(connectionString);

  return {
    connectionString,
    container,
    stop: async () => {
      await container.stop();
    },
  };
}

function applyMigrations(connectionString: string): void {
  assertNotEnvDatabase(connectionString);

  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: path.resolve(process.cwd()),
    env: { ...process.env, DATABASE_URL: connectionString },
    stdio: 'pipe',
  });
}
