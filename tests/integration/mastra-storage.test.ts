// ai-assistant T04 - Mastra storage lives in its own `mastra` schema, created by the explicit
// `pnpm mastra:migrate` step beside `prisma migrate deploy`; Prisma never sees it (sad.md §7, §11).
import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../support/db/container';
import { createTestPrismaClient } from '../support/db/client';
import { assertNotEnvDatabase } from '../support/db/env-guard';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

function pnpm(args: string[], url: string): string {
  assertNotEnvDatabase(url);
  return execFileSync('pnpm', args, {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
    encoding: 'utf8',
  });
}

describe.runIf(containerRuntimeAvailable)('mastra storage schema', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;

  const tablesIn = async (schema: string): Promise<string[]> => {
    const rows = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = '${schema}'`
    );
    return rows.map((r) => r.table_name);
  };

  beforeAll(async () => {
    db = await startTestDatabase();
    prisma = createTestPrismaClient(db.connectionString);
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  it('the integration setup already created tables in schema mastra', async () => {
    expect((await tablesIn('mastra')).length).toBeGreaterThan(0);
  });

  it('mastra:migrate run twice is a no-op and adds no Mastra table to public', async () => {
    const before = (await tablesIn('mastra')).sort();
    pnpm(['mastra:migrate'], db.connectionString);
    pnpm(['mastra:migrate'], db.connectionString);
    expect((await tablesIn('mastra')).sort()).toEqual(before);
    const publicTables = await tablesIn('public');
    expect(publicTables.filter((t) => t.startsWith('mastra_'))).toEqual([]);
    expect(publicTables.every((t) => !before.includes(t) || t === '_prisma_migrations')).toBe(true);
  });

  it('prisma migrate diff against the migrated database stays empty', () => {
    expect(() =>
      pnpm(
        [
          'exec', 'prisma', 'migrate', 'diff',
          '--from-config-datasource',
          '--to-schema', 'prisma/schema',
          '--exit-code',
        ],
        db.connectionString
      )
    ).not.toThrow();
  });
});
