// LimitStoreUnavailable wrapping of DB failures *inside* the locked callback.
// A fake Prisma client runs the transaction callback with a tx whose lock call succeeds and
// whose limitEvent / raw calls reject, as a lost connection or statement timeout would.
import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  createLimitStore,
  LimitStoreUnavailable,
  type LockedLimit,
} from '@/lib/security/limits/limit-store';

const T0 = new Date('2026-10-02T12:00:00.000Z');
const clock = { now: () => T0 };
const dbError = () =>
  Promise.reject(new Error('Transaction already closed: 203.0.113.7:5432'));

type Failing = 'count' | 'findFirst' | 'create' | 'updateMany' | 'purge';

function fakePrisma(tx: Record<string, unknown>): PrismaClient {
  return {
    $transaction: (cb: (t: unknown) => Promise<unknown>) => cb(tx),
  } as unknown as PrismaClient;
}

function failingTx(failing: Failing) {
  const ok = <T>(v: T) => vi.fn(() => Promise.resolve(v));
  let executeCalls = 0;
  return {
    // the first $executeRaw is the advisory lock; the next one is the bounded purge
    $executeRaw: vi.fn(() => {
      executeCalls += 1;
      return executeCalls > 1 && failing === 'purge'
        ? dbError()
        : Promise.resolve(0);
    }),
    limitEvent: {
      count: failing === 'count' ? vi.fn(dbError) : ok(0),
      findFirst: failing === 'findFirst' ? vi.fn(dbError) : ok(null),
      create: failing === 'create' ? vi.fn(dbError) : ok({ id: 'r1' }),
      updateMany: failing === 'updateMany' ? vi.fn(dbError) : ok({ count: 1 }),
    },
  };
}

const cases: [Failing, (l: LockedLimit) => Promise<unknown>][] = [
  ['count', (l) => l.countInWindow()],
  ['findFirst', (l) => l.oldestCountedAt()],
  ['findFirst', (l) => l.retryAt()],
  ['create', (l) => l.record('REQUESTED')],
  ['purge', (l) => l.record('REQUESTED')],
  ['updateMany', (l) => l.markFailed('r1')],
];

describe('limit store DB-failure wrapping (T8)', () => {
  it.each(cases)(
    'a failing %s inside the lock rejects with LimitStoreUnavailable',
    async (failing, fn) => {
      const store = createLimitStore({
        prisma: fakePrisma(failingTx(failing)),
        clock,
      });
      const err = await store
        .withKeyLock('SIGNIN_SOURCE', 'k', fn)
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(LimitStoreUnavailable);
      expect((err as Error).message).not.toContain('203.0.113.7');
    }
  );

  it('the callback itself sees the typed error, so it can fail closed', async () => {
    const store = createLimitStore({
      prisma: fakePrisma(failingTx('count')),
      clock,
    });
    const seen = await store.withKeyLock('SIGNIN_SOURCE', 'k', (l) =>
      l.countInWindow().catch((e: unknown) => e)
    );
    expect(seen).toBeInstanceOf(LimitStoreUnavailable);
  });

  it('a genuine caller-callback error is re-thrown unchanged', async () => {
    const store = createLimitStore({
      prisma: fakePrisma(failingTx('count')),
      clock,
    });
    const own = new Error('caller bug');
    const err = await store
      .withKeyLock('SIGNIN_SOURCE', 'k', async () => {
        throw own;
      })
      .catch((e: unknown) => e);
    expect(err).toBe(own);
  });
});
