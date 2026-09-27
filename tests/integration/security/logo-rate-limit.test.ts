// T04 — the per-Freelancer sliding-window logo rate limiter (AC-03, ADR-0008).
//
// test-plan.md rows exercised here (integration):
//   - "31st real fetch within a minute is refused"
//   - concurrency edge case: "Two concurrent requests at the 30th slot -> exactly one succeeds"
//   - "Window boundary (call at :59.9 then :00.1) -> sliding estimate carries most of the
//     previous window; no burst of 60"
//   - "Store unreachable -> throws -> endpoint returns UNAVAILABLE (fails closed)"
//   - "Caller-scoped cleanup: only rows of the calling Freelancer are ever deleted"
//   - independence between Freelancers (spec.md §6 NFR row, "per Freelancer")
//
// Seam this test assumes (lib/security/logo-rate-limit.ts, not yet created):
//
//   export interface LogoRateLimiterOverrides {
//     prisma?: PrismaClient;   // injected so tests run against the container, not `@/prisma`
//     clock?: Clock;           // tests/support/clock.ts seam - the injected clock for the
//                              // rate-limit window (test-plan.md §Test data)
//   }
//   export type ConsumeLogoFetchResult =
//     | { allowed: true }
//     | { allowed: false; retryAfterSeconds: number };
//   export function createLogoRateLimiter(overrides?: LogoRateLimiterOverrides): {
//     consumeLogoFetch(userId: string): Promise<ConsumeLogoFetchResult>;
//   }
//   export function consumeLogoFetch(userId: string): Promise<ConsumeLogoFetchResult>; //
//     // production default, built from createLogoRateLimiter() with no overrides (system clock,
//     // `@/prisma`) - the function T05 imports, per the task file's "API contract" section.
//
// This mirrors the createSafeFetcher(...)/safeFetchImage seam T03 already established in
// lib/security/safe-fetch.ts (tests/integration/security/safe-fetch.test.ts), so the DI seam is
// consistent across lib/security/*.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../support/db/container';
import { createTestPrismaClient } from '../../support/db/client';
import { truncateAllTables } from '../../support/db/truncate';
import { createFreelancer } from '../../support/factories/user';
import { createLogoFetchWindow } from '../../support/factories/logo-fetch-window';
import { createFixedClock } from '../../support/clock';
import { createLogoRateLimiter } from '@/lib/security/logo-rate-limit';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

/** Align to the start of the UTC minute containing `d`, matching the ADR-0008 window shape. */
function minuteStart(d: Date): Date {
  const t = new Date(d);
  t.setUTCSeconds(0, 0);
  return t;
}

describe.runIf(containerRuntimeAvailable)('consumeLogoFetch (T04, AC-03, ADR-0008)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;
  const extraClients: PrismaClient[] = [];

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
    await Promise.all(extraClients.map((c) => c.$disconnect()));
    extraClients.length = 0;
  });

  function extraClient(): PrismaClient {
    const client = createTestPrismaClient(db.connectionString);
    extraClients.push(client);
    return client;
  }

  it('allows the first 30 calls in a window and refuses the 31st with retryAfterSeconds in [1, 60]', async () => {
    const freelancer = await createFreelancer(prisma);
    const now = new Date('2026-09-27T12:00:10.000Z');
    const clock = createFixedClock(now);
    const limiter = createLogoRateLimiter({ prisma, clock });

    const results = [];
    for (let i = 0; i < 31; i += 1) {
      results.push(await limiter.consumeLogoFetch(freelancer.id));
    }

    const allowedCount = results.filter((r) => r.allowed).length;
    expect(allowedCount).toBe(30);

    const last = results[30];
    expect(last?.allowed).toBe(false);
    if (!last?.allowed) {
      expect(last?.retryAfterSeconds).toBeGreaterThanOrEqual(1);
      expect(last?.retryAfterSeconds).toBeLessThanOrEqual(60);
    }
  });

  it('tracks each Freelancer independently: one Freelancer at the limit does not affect another', async () => {
    const freelancerA = await createFreelancer(prisma);
    const freelancerB = await createFreelancer(prisma);
    const clock = createFixedClock(new Date('2026-09-27T12:00:10.000Z'));
    const limiter = createLogoRateLimiter({ prisma, clock });

    for (let i = 0; i < 30; i += 1) {
      await limiter.consumeLogoFetch(freelancerA.id);
    }
    const aRefused = await limiter.consumeLogoFetch(freelancerA.id);
    const bAllowed = await limiter.consumeLogoFetch(freelancerB.id);

    expect(aRefused.allowed).toBe(false);
    expect(bAllowed.allowed).toBe(true);
  });

  it('carries most of the previous window across a minute boundary so no burst of 60 gets through', async () => {
    const freelancer = await createFreelancer(prisma);
    const prevWindowStart = new Date('2026-09-27T11:59:00.000Z');
    // Previous window already at the cap.
    await createLogoFetchWindow(prisma, {
      userId: freelancer.id,
      windowStart: prevWindowStart,
      count: 30,
    });

    // 0.1s into the new window: elapsed fraction ~= 0.1/60, so the sliding estimate is
    // ~30 * (1 - 0.1/60) + 1 (this call) ~= 30.95, which must be refused - a plain fixed window
    // would allow a fresh 30 here (a burst of 60 across the boundary), which ADR-0008 exists to
    // prevent.
    const clock = createFixedClock(new Date('2026-09-27T12:00:00.100Z'));
    const limiter = createLogoRateLimiter({ prisma, clock });

    const result = await limiter.consumeLogoFetch(freelancer.id);

    expect(result.allowed).toBe(false);
  });

  it('allows fresh calls once the previous window has decayed enough under the sliding estimate', async () => {
    const freelancer = await createFreelancer(prisma);
    const prevWindowStart = new Date('2026-09-27T11:59:00.000Z');
    await createLogoFetchWindow(prisma, {
      userId: freelancer.id,
      windowStart: prevWindowStart,
      count: 2,
    });

    // 45s into the new window: estimate ~= 2 * (1 - 45/60) + 1 = 1.5, well under 30.
    const clock = createFixedClock(new Date('2026-09-27T12:00:45.000Z'));
    const limiter = createLogoRateLimiter({ prisma, clock });

    const result = await limiter.consumeLogoFetch(freelancer.id);

    expect(result.allowed).toBe(true);
  });

  it('never over-admits under concurrency: 40 parallel calls on separate connections yield exactly 30 allowed', async () => {
    const freelancer = await createFreelancer(prisma);
    const clock = createFixedClock(new Date('2026-09-27T12:00:10.000Z'));

    const calls = Array.from({ length: 40 }, () => {
      // A fresh Prisma client (own connection) per call, so the upsert genuinely races across
      // separate connections rather than serializing for free on one connection/session.
      const client = extraClient();
      const limiter = createLogoRateLimiter({ prisma: client, clock });
      return limiter.consumeLogoFetch(freelancer.id);
    });

    const results = await Promise.all(calls);

    const allowedCount = results.filter((r) => r.allowed).length;
    expect(allowedCount).toBe(30);

    const window = await prisma.logoFetchWindow.findUniqueOrThrow({
      where: {
        userId_windowStart: { userId: freelancer.id, windowStart: minuteStart(clock.now()) },
      },
    });
    // Every call increments the stored counter even when refused (increment happens before the
    // allow/refuse decision reads it back), so the stored count must equal all 40 attempts with
    // no lost update - not silently capped at 30.
    expect(window.count).toBe(40);
  });

  it('deletes only the calling Freelancer\'s stale windows, never another Freelancer\'s', async () => {
    const freelancerA = await createFreelancer(prisma);
    const freelancerB = await createFreelancer(prisma);
    const staleWindowStart = new Date('2026-09-27T11:00:00.000Z');

    await createLogoFetchWindow(prisma, {
      userId: freelancerA.id,
      windowStart: staleWindowStart,
      count: 5,
    });
    await createLogoFetchWindow(prisma, {
      userId: freelancerB.id,
      windowStart: staleWindowStart,
      count: 5,
    });

    const clock = createFixedClock(new Date('2026-09-27T12:05:00.000Z'));
    const limiter = createLogoRateLimiter({ prisma, clock });

    await limiter.consumeLogoFetch(freelancerA.id);

    const aStale = await prisma.logoFetchWindow.findUnique({
      where: { userId_windowStart: { userId: freelancerA.id, windowStart: staleWindowStart } },
    });
    const bStale = await prisma.logoFetchWindow.findUnique({
      where: { userId_windowStart: { userId: freelancerB.id, windowStart: staleWindowStart } },
    });

    expect(aStale, "freelancer A's own stale window should be cleaned up").toBeNull();
    expect(bStale, "freelancer B's stale window must survive A's cleanup").not.toBeNull();
  });

  it('fails closed: propagates the error instead of swallowing it when the store is unreachable', async () => {
    const brokenPrisma = {
      $queryRaw: () => Promise.reject(new Error('connection terminated')),
      $executeRaw: () => Promise.reject(new Error('connection terminated')),
    } as unknown as PrismaClient;
    const clock = createFixedClock(new Date('2026-09-27T12:00:10.000Z'));
    const limiter = createLogoRateLimiter({ prisma: brokenPrisma, clock });

    await expect(limiter.consumeLogoFetch('some-user-id')).rejects.toThrow();
  });
});

describe.runIf(!containerRuntimeAvailable)('consumeLogoFetch (T04, AC-03, ADR-0008)', () => {
  it.skip('skipped: no container runtime', () => {});
});
