// T01 - Add the LogoFetchWindow table and Prisma model (AC-03).
// docs/features/architecture-hardening/tasks/t01-logo-fetch-window-table.md, data-model.md
// §Entities/LogoFetchWindow: composite PK (userId, windowStart), FK userId -> User(id) ON
// DELETE CASCADE, count INTEGER NOT NULL DEFAULT 0. This table is what the per-Freelancer
// logo-fetch rate limiter (T04) counts against so AC-03's "too many requests, try again in a
// minute" can be enforced across serverless invocations.
//
// RED (T01 not yet implemented): `startTestDatabase()` runs `prisma migrate deploy` against
// `prisma/migrations/` - the staged pair under
// docs/features/architecture-hardening/migrations/01_create_logo_fetch_window.{up,down}.sql is
// NOT yet promoted there, so this table should not exist and `prisma.logoFetchWindow` should
// not be typed/generated. All assertions below are expected to fail until T01 promotes the
// migration and adds `model LogoFetchWindow` to prisma/schema/auth.prisma.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { isContainerRuntimeAvailable } from '../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../support/db/container';
import { createTestPrismaClient } from '../support/db/client';
import { truncateAllTables } from '../support/db/truncate';
import { createFreelancer } from '../support/factories/user';
import { createLogoFetchWindow } from '../support/factories/logo-fetch-window';
import type { PrismaClient } from '@prisma/client';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

const STAGED_UP_SQL_PATH = path.resolve(
  process.cwd(),
  'docs/features/architecture-hardening/migrations/01_create_logo_fetch_window.up.sql'
);
const STAGED_DOWN_SQL_PATH = path.resolve(
  process.cwd(),
  'docs/features/architecture-hardening/migrations/01_create_logo_fetch_window.down.sql'
);

interface ColumnRow {
  column_name: string;
  data_type: string;
  is_nullable: 'YES' | 'NO';
  column_default: string | null;
}

describe.runIf(containerRuntimeAvailable)('LogoFetchWindow table (T01, AC-03)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;

  beforeAll(async () => {
    db = await startTestDatabase(); // runs `prisma migrate deploy` against prisma/migrations/
    prisma = createTestPrismaClient(db.connectionString);
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  beforeEach(async () => {
    await truncateAllTables(prisma);
  });

  it('creates a table named LogoFetchWindow with the composite PK, FK and column shape from data-model.md', async () => {
    const columns = await prisma.$queryRaw<ColumnRow[]>`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'LogoFetchWindow'
      ORDER BY ordinal_position
    `;

    const byName = Object.fromEntries(columns.map((c) => [c.column_name, c]));

    expect(byName.userId, 'expected a "userId" column on LogoFetchWindow').toBeDefined();
    expect(byName.userId?.data_type).toBe('text');
    expect(byName.userId?.is_nullable).toBe('NO');

    expect(byName.windowStart, 'expected a "windowStart" column on LogoFetchWindow').toBeDefined();
    expect(byName.windowStart?.data_type).toBe('timestamp without time zone');
    expect(byName.windowStart?.is_nullable).toBe('NO');

    expect(byName.count, 'expected a "count" column on LogoFetchWindow').toBeDefined();
    expect(byName.count?.data_type).toBe('integer');
    expect(byName.count?.is_nullable).toBe('NO');
    expect(byName.count?.column_default).toMatch(/^0/);

    const pkColumns = await prisma.$queryRaw<{ attname: string }[]>`
      SELECT a.attname
      FROM pg_index i
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
      WHERE i.indrelid = '"LogoFetchWindow"'::regclass AND i.indisprimary
      ORDER BY array_position(i.indkey, a.attnum)
    `;
    expect(pkColumns.map((r) => r.attname)).toEqual(['userId', 'windowStart']);

    const fkRows = await prisma.$queryRaw<
      { confrelid_name: string; confdeltype: string }[]
    >`
      SELECT confrelid::regclass::text AS confrelid_name, confdeltype::text AS confdeltype
      FROM pg_constraint
      WHERE conrelid = '"LogoFetchWindow"'::regclass AND contype = 'f'
    `;
    expect(fkRows).toHaveLength(1);
    expect(fkRows[0]?.confrelid_name).toBe('"User"');
    // 'c' = ON DELETE CASCADE (pg_constraint.confdeltype)
    expect(fkRows[0]?.confdeltype).toBe('c');
  });

  it('exposes prisma.logoFetchWindow so a Freelancer\'s window row can be created and read back', async () => {
    const freelancer = await createFreelancer(prisma);
    const windowStart = new Date('2026-09-27T12:00:00.000Z');

    await createLogoFetchWindow(prisma, {
      userId: freelancer.id,
      windowStart,
      count: 3,
    });

    const row = await prisma.logoFetchWindow.findUniqueOrThrow({
      where: { userId_windowStart: { userId: freelancer.id, windowStart } },
    });

    expect(row.count).toBe(3);
  });

  it('cascades LogoFetchWindow rows when the owning User is deleted', async () => {
    const freelancer = await createFreelancer(prisma);
    const windowStart = new Date('2026-09-27T12:01:00.000Z');

    await createLogoFetchWindow(prisma, {
      userId: freelancer.id,
      windowStart,
      count: 1,
    });

    await prisma.user.delete({ where: { id: freelancer.id } });

    const remaining = await prisma.logoFetchWindow.findMany({
      where: { userId: freelancer.id },
    });
    expect(remaining).toHaveLength(0);
  });

  it('applies and reverts cleanly: staged down SQL drops the promoted table, staged up SQL recreates it', async () => {
    const upSql = fs.readFileSync(STAGED_UP_SQL_PATH, 'utf8');
    const downSql = fs.readFileSync(STAGED_DOWN_SQL_PATH, 'utf8');

    // Table must already exist from `prisma migrate deploy` (the promoted migration), not just
    // from running the staged SQL by hand - otherwise this test would pass before T01 promotes
    // anything.
    const beforeDown = await prisma.$queryRaw<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'LogoFetchWindow'
      ) AS exists
    `;
    expect(beforeDown[0]?.exists, 'expected `prisma migrate deploy` to have already created LogoFetchWindow').toBe(true);

    await prisma.$executeRawUnsafe(downSql);

    const afterDown = await prisma.$queryRaw<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'LogoFetchWindow'
      ) AS exists
    `;
    expect(afterDown[0]?.exists).toBe(false);

    await prisma.$executeRawUnsafe(upSql);

    const afterUp = await prisma.$queryRaw<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'LogoFetchWindow'
      ) AS exists
    `;
    expect(afterUp[0]?.exists).toBe(true);
  });
});

describe.runIf(!containerRuntimeAvailable)('LogoFetchWindow table (T01, AC-03)', () => {
  it.skip('skipped: no container runtime', () => {});
});
