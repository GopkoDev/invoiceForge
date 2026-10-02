// T8 - the LimitEvent limit store (AC-12, AC-13; ADR-0002, ADR-0007).
//
// Seam assumed (lib/security/limits/limit-store.ts, not yet created):
//
//   export class LimitStoreUnavailable extends Error {}
//   export interface LimitStoreOverrides { prisma?: PrismaClient; clock?: Clock }
//   export interface LockedLimit {            // bound to one (scope, key) inside the lock
//     countInWindow(): Promise<number>;       // counted outcomes, at > clock.now() - window
//     record(outcome: LimitOutcome, opts?: { userId?: string }): Promise<{ id: string }>;
//                                             // at = clock.now(); also runs the bounded purge
//     oldestCountedAt(): Promise<Date | null>;
//     retryAt(): Promise<Date | null>;        // oldestCountedAt + window, null when empty
//     markFailed(id: string): Promise<void>;  // STARTED -> FAILED
//   }
//   export function createLimitStore(overrides?: LimitStoreOverrides): {
//     withKeyLock<T>(scope: LimitScope, key: string, fn: (l: LockedLimit) => Promise<T>): Promise<T>;
//     purgeOlderThan24h(): Promise<number>;
//   }
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../../support/db/docker-availability';
import {
  startTestDatabase,
  type TestDatabase,
} from '../../../support/db/container';
import { createTestPrismaClient } from '../../../support/db/client';
import { truncateAllTables } from '../../../support/db/truncate';
import { createFreelancer } from '../../../support/factories/user';
import {
  createLimitEvent,
  limitKeyDigest,
} from '../../../support/factories/limit-event';
import { createFixedClock } from '../../../support/clock';
import {
  createLimitStore,
  LimitStoreUnavailable,
} from '@/lib/security/limits/limit-store';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();
const MIN = 60_000;
const HOUR = 60 * MIN;
const T0 = new Date('2026-10-02T12:00:00.000Z');

describe.runIf(containerRuntimeAvailable)('limit store (T8)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;
  const extra: PrismaClient[] = [];

  beforeAll(async () => {
    db = await startTestDatabase();
    prisma = createTestPrismaClient(db.connectionString);
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  afterEach(async () => {
    await truncateAllTables(prisma);
    await Promise.all(extra.map((c) => c.$disconnect()));
    extra.length = 0;
  });

  const key = limitKeyDigest('person@example.com');

  it('counts exactly at the window edge: a row exactly one window old is outside', async () => {
    const clock = createFixedClock(T0);
    await createLimitEvent(prisma, {
      scope: 'SIGNIN_ADDRESS',
      key,
      outcome: 'SENT',
      at: new Date(T0.getTime() - HOUR),
    });
    await createLimitEvent(prisma, {
      scope: 'SIGNIN_ADDRESS',
      key,
      outcome: 'SENT',
      at: new Date(T0.getTime() - HOUR + 1),
    });
    const store = createLimitStore({ prisma, clock });
    const n = await store.withKeyLock('SIGNIN_ADDRESS', key, (l) =>
      l.countInWindow()
    );
    expect(n).toBe(1);
  });

  it('counts only the scope-counted outcomes, per key', async () => {
    const clock = createFixedClock(T0);
    await createLimitEvent(prisma, {
      scope: 'SIGNIN_ADDRESS',
      key,
      outcome: 'SENT',
      at: T0,
    });
    await createLimitEvent(prisma, {
      scope: 'SIGNIN_ADDRESS',
      key,
      outcome: 'REFUSED',
      at: T0,
    });
    await createLimitEvent(prisma, {
      scope: 'SIGNIN_ADDRESS',
      key: limitKeyDigest('other@example.com'),
      outcome: 'SENT',
      at: T0,
    });
    const store = createLimitStore({ prisma, clock });
    expect(
      await store.withKeyLock('SIGNIN_ADDRESS', key, (l) => l.countInWindow())
    ).toBe(1);
  });

  it('record stamps `at` from the injected clock and the window slides with it', async () => {
    const clock = createFixedClock(T0);
    const store = createLimitStore({ prisma, clock });
    await store.withKeyLock('SIGNIN_SOURCE', key, (l) => l.record('REQUESTED'));
    const row = await prisma.limitEvent.findFirstOrThrow({ where: { key } });
    expect(row.at.toISOString()).toBe(T0.toISOString());
    expect(row.outcome).toBe('REQUESTED');
    clock.advance(5 * MIN);
    expect(
      await store.withKeyLock('SIGNIN_SOURCE', key, (l) => l.countInWindow())
    ).toBe(0);
  });

  it('10 concurrent EXPORT reservations for one key -> exactly 3 succeed', async () => {
    const user = await createFreelancer(prisma);
    const clock = createFixedClock(T0);
    const stores = Array.from({ length: 10 }, () => {
      const client = createTestPrismaClient(db.connectionString);
      extra.push(client);
      return createLimitStore({ prisma: client, clock });
    });
    const results = await Promise.all(
      stores.map((store) =>
        store.withKeyLock('EXPORT', user.id, async (l) => {
          if ((await l.countInWindow()) >= 3) return false;
          await l.record('STARTED', { userId: user.id });
          return true;
        })
      )
    );
    expect(results.filter(Boolean)).toHaveLength(3);
    expect(
      await prisma.limitEvent.count({
        where: { key: user.id, outcome: 'STARTED' },
      })
    ).toBe(3);
  }, 60_000);

  it('markFailed flips STARTED to FAILED and frees a place', async () => {
    const user = await createFreelancer(prisma);
    const store = createLimitStore({ prisma, clock: createFixedClock(T0) });
    const ids: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const row = await store.withKeyLock('EXPORT', user.id, (l) =>
        l.record('STARTED', { userId: user.id })
      );
      ids.push(row.id);
    }
    expect(
      await store.withKeyLock('EXPORT', user.id, (l) => l.countInWindow())
    ).toBe(3);
    await store.withKeyLock('EXPORT', user.id, (l) => l.markFailed(ids[0]!));
    expect(
      await store.withKeyLock('EXPORT', user.id, (l) => l.countInWindow())
    ).toBe(2);
    const row = await prisma.limitEvent.findUniqueOrThrow({
      where: { id: ids[0]! },
    });
    expect(row.outcome).toBe('FAILED');
  });

  it('retryAt is the oldest counted row plus the window', async () => {
    const user = await createFreelancer(prisma);
    const oldest = new Date(T0.getTime() - 40 * MIN);
    const base = { scope: 'EXPORT', key: user.id, userId: user.id } as const;
    await createLimitEvent(prisma, { ...base, outcome: 'STARTED', at: oldest });
    await createLimitEvent(prisma, {
      ...base,
      outcome: 'STARTED',
      at: new Date(T0.getTime() - 10 * MIN),
    });
    await createLimitEvent(prisma, {
      ...base,
      outcome: 'FAILED',
      at: new Date(T0.getTime() - 50 * MIN),
    });
    const store = createLimitStore({ prisma, clock: createFixedClock(T0) });
    const [o, r] = await store.withKeyLock('EXPORT', user.id, async (l) => [
      await l.oldestCountedAt(),
      await l.retryAt(),
    ]);
    expect(o?.toISOString()).toBe(oldest.toISOString());
    expect(r?.toISOString()).toBe(
      new Date(oldest.getTime() + HOUR).toISOString()
    );
  });

  it('every record runs a bounded purge: at most 100 rows older than 24 h across keys', async () => {
    const old = new Date(T0.getTime() - 25 * HOUR);
    for (let i = 0; i < 150; i += 1) {
      await createLimitEvent(prisma, {
        scope: 'SIGNIN_SOURCE',
        key: limitKeyDigest(`k${i % 7}`),
        at: old,
      });
    }
    const store = createLimitStore({ prisma, clock: createFixedClock(T0) });
    await store.withKeyLock('SIGNIN_SOURCE', key, (l) => l.record('REQUESTED'));
    const cutoff = new Date(T0.getTime() - 24 * HOUR);
    expect(
      await prisma.limitEvent.count({ where: { at: { lt: cutoff } } })
    ).toBe(50);
    expect(await prisma.limitEvent.count({ where: { key } })).toBe(1);
  });

  it('purgeOlderThan24h deletes every row older than 24 h and returns the count', async () => {
    for (let i = 0; i < 130; i += 1) {
      await createLimitEvent(prisma, {
        at: new Date(T0.getTime() - 25 * HOUR),
      });
    }
    await createLimitEvent(prisma, { at: new Date(T0.getTime() - 23 * HOUR) });
    const store = createLimitStore({ prisma, clock: createFixedClock(T0) });
    expect(await store.purgeOlderThan24h()).toBe(130);
    expect(await prisma.limitEvent.count()).toBe(1);
  });

  it('gives the same counts under a non-UTC Postgres session time zone', async () => {
    const base = { scope: 'SIGNIN_ADDRESS', key, outcome: 'SENT' } as const;
    await createLimitEvent(prisma, {
      ...base,
      at: new Date(T0.getTime() - 30 * MIN),
    });
    await createLimitEvent(prisma, {
      ...base,
      at: new Date(T0.getTime() - 90 * MIN),
    });
    const url = new URL(db.connectionString);
    url.searchParams.set('options', '-c TimeZone=Pacific/Kiritimati');
    const tzClient = createTestPrismaClient(url.toString());
    extra.push(tzClient);
    const tz = await tzClient.$queryRaw<{ TimeZone: string }[]>`SHOW TIME ZONE`;
    expect(tz[0]?.TimeZone).toBe('Pacific/Kiritimati');
    const store = createLimitStore({
      prisma: tzClient,
      clock: createFixedClock(T0),
    });
    expect(
      await store.withKeyLock('SIGNIN_ADDRESS', key, (l) => l.countInWindow())
    ).toBe(1);
  });

  it('a DB error inside the locked callback is wrapped as LimitStoreUnavailable, nothing recorded', async () => {
    const store = createLimitStore({ prisma, clock: createFixedClock(T0) });
    const err = await store
      .withKeyLock('EXPORT', 'no-such-user', (l) =>
        l.record('STARTED', { userId: 'no-such-user' })
      )
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LimitStoreUnavailable);
    expect(await prisma.limitEvent.count()).toBe(0);
  });

  it('wraps database failures as LimitStoreUnavailable, leaking no address, recording nothing', async () => {
    const fail = () =>
      Promise.reject(new Error('connect ECONNREFUSED 203.0.113.7:5432'));
    const broken = {
      $transaction: fail,
      $queryRaw: fail,
      $executeRaw: fail,
    } as unknown as PrismaClient;
    const store = createLimitStore({
      prisma: broken,
      clock: createFixedClock(T0),
    });
    const err = await store
      .withKeyLock('SIGNIN_SOURCE', key, (l) => l.record('REQUESTED'))
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LimitStoreUnavailable);
    expect(String((err as Error).message)).not.toContain('203.0.113.7');
    expect(await prisma.limitEvent.count()).toBe(0);
  });
});
