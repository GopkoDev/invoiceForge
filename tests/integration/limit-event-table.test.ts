// T3 - Promote the LimitEvent migration with its Prisma model, factory and test cleanup.
// data-model.md §LimitEvent, ADR-0002. Supports the NFR "Limit-record retention" (LimitEvent_at_idx).
//
// RED: the staged pair docs/features/security-patch/migrations/01_create_limit_event.{up,down}.sql
// is not yet promoted to prisma/migrations/, so `prisma migrate deploy` does not create the table
// and `prisma.limitEvent` does not exist.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { isContainerRuntimeAvailable } from '../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../support/db/container';
import { createTestPrismaClient } from '../support/db/client';
import { truncateAllTables } from '../support/db/truncate';
import { createFreelancer } from '../support/factories/user';
import {
  createLimitEvent,
  limitKeyDigest,
} from '../support/factories/limit-event';
import type { PrismaClient } from '@prisma/client';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

const MIGRATIONS_DIR = path.resolve(
  process.cwd(),
  'docs/features/security-patch/migrations'
);
const UP_SQL = path.join(MIGRATIONS_DIR, '01_create_limit_event.up.sql');
const DOWN_SQL = path.join(MIGRATIONS_DIR, '01_create_limit_event.down.sql');

describe.runIf(containerRuntimeAvailable)('LimitEvent table (T3)', () => {
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

  const tableExists = async () => {
    const r = await prisma.$queryRaw<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'LimitEvent'
      ) AS exists`;
    return r[0]?.exists;
  };

  it('is created by prisma migrate deploy with the column shape, indexes and cascade FK', async () => {
    expect(
      await tableExists(),
      'expected migrate deploy to create LimitEvent'
    ).toBe(true);

    const cols = await prisma.$queryRaw<
      { column_name: string; udt_name: string; is_nullable: string }[]
    >`SELECT column_name, udt_name, is_nullable FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'LimitEvent'`;
    const by = Object.fromEntries(cols.map((c) => [c.column_name, c]));
    expect(by.id?.udt_name).toBe('text');
    expect(by.scope?.udt_name).toBe('LimitScope');
    expect(by.scope?.is_nullable).toBe('NO');
    expect(by.key?.is_nullable).toBe('NO');
    expect(by.outcome?.udt_name).toBe('LimitOutcome');
    expect(by.at?.udt_name).toBe('timestamp');
    expect(by.userId?.is_nullable).toBe('YES');

    const idx = await prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes WHERE tablename = 'LimitEvent'`;
    expect(idx.map((i) => i.indexname).sort()).toEqual([
      'LimitEvent_at_idx',
      'LimitEvent_pkey',
      'LimitEvent_scope_key_at_idx',
      'LimitEvent_userId_idx',
    ]);

    const fk = await prisma.$queryRaw<{ confdeltype: string }[]>`
      SELECT confdeltype::text AS confdeltype FROM pg_constraint
      WHERE conrelid = '"LimitEvent"'::regclass AND contype = 'f'`;
    expect(fk.map((f) => f.confdeltype)).toEqual(['c']);
  });

  it('rejects an unknown scope', async () => {
    expect(await tableExists(), 'expected LimitEvent to exist').toBe(true);
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO "LimitEvent" ("id","scope","key","outcome") VALUES ('x','BOGUS','k','SENT')`
      )
    ).rejects.toThrow(/invalid input value for enum|LimitScope/i);
  });

  it('rejects an unknown userId via the foreign key', async () => {
    await expect(
      createLimitEvent(prisma, { scope: 'EXPORT', userId: 'no-such-user' })
    ).rejects.toThrow(/foreign key|LimitEvent_userId_fkey/i);
  });

  it("cascades a deleted User's EXPORT rows only; sign-in rows remain", async () => {
    const freelancer = await createFreelancer(prisma);
    await createLimitEvent(prisma, { scope: 'EXPORT', userId: freelancer.id });
    await createLimitEvent(prisma, {
      scope: 'SIGNIN_ADDRESS',
      key: limitKeyDigest('user-1@example.test'),
    });
    await createLimitEvent(prisma, { scope: 'SIGNIN_SOURCE' });

    await prisma.user.delete({ where: { id: freelancer.id } });

    const rows = await prisma.limitEvent.findMany();
    expect(rows.map((r) => r.scope).sort()).toEqual([
      'SIGNIN_ADDRESS',
      'SIGNIN_SOURCE',
    ]);
  });

  it('down after up restores the previous schema, and up is idempotent', async () => {
    const up = fs.readFileSync(UP_SQL, 'utf8');
    const down = fs.readFileSync(DOWN_SQL, 'utf8');
    expect(
      await tableExists(),
      'expected promoted migration to have created LimitEvent'
    ).toBe(true);

    await prisma.$executeRawUnsafe(down);
    expect(await tableExists()).toBe(false);
    const types = await prisma.$queryRaw<{ typname: string }[]>`
      SELECT typname FROM pg_type WHERE typname IN ('LimitScope','LimitOutcome')`;
    expect(types).toHaveLength(0);

    await prisma.$executeRawUnsafe(up);
    await prisma.$executeRawUnsafe(up); // idempotent
    expect(await tableExists()).toBe(true);
  });
});

describe.runIf(!containerRuntimeAvailable)('LimitEvent table (T3)', () => {
  it.skip('skipped: no container runtime', () => {});
});
