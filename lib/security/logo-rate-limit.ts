// T04 — the per-Freelancer sliding-window logo rate limiter (AC-03, ADR-0008).
//
// The counter is a Postgres sliding-window estimate, not an exact 60-second log (sad.md §11,
// accepted debt). One row per Freelancer per UTC minute (`LogoFetchWindow`, T01). Each call:
//   1. Upserts (INSERT ... ON CONFLICT DO UPDATE SET count = count + 1 RETURNING count) on the
//      current minute window - this serializes concurrent callers on the PK row (data-model.md).
//   2. Reads the previous minute's count (if any).
//   3. Estimates `prev * (1 - elapsed/60) + current` and allows when <= 30; when refused, undoes
//      this call's own increment (F-20) so a refused call never counts against the window.
//   4. Opportunistically deletes the caller's own stale windows (best-effort, errors swallowed).
//
// The upsert/read must never be caught here: a store outage has to propagate so the caller
// (T05) fails closed and maps it to UNAVAILABLE (ADR-0008, openapi.yaml 502 hard rule).

import type { PrismaClient } from '@prisma/client';

const WINDOW_MS = 60_000;
const LIMIT = 30;

/** Minimal structural clock, matching tests/support/clock.ts's `Clock` without importing it. */
export interface Clock {
  now(): Date;
}

const systemClock: Clock = {
  now: () => new Date(),
};

export interface LogoRateLimiterOverrides {
  prisma?: PrismaClient;
  clock?: Clock;
}

export type ConsumeLogoFetchResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

/** Align to the start of the UTC minute containing `d`, matching the ADR-0008 window shape. */
function minuteStart(d: Date): Date {
  const t = new Date(d);
  t.setUTCSeconds(0, 0);
  return t;
}

export function createLogoRateLimiter(overrides?: LogoRateLimiterOverrides): {
  consumeLogoFetch(userId: string): Promise<ConsumeLogoFetchResult>;
} {
  const clock = overrides?.clock ?? systemClock;

  async function getPrisma(): Promise<PrismaClient> {
    if (overrides?.prisma) return overrides.prisma;
    const { prisma } = await import('@/prisma');
    return prisma;
  }

  async function consumeLogoFetch(userId: string): Promise<ConsumeLogoFetchResult> {
    const prisma = await getPrisma();
    const now = clock.now();
    const windowStart = minuteStart(now);
    const prevWindowStart = new Date(windowStart.getTime() - WINDOW_MS);
    const elapsedMs = now.getTime() - windowStart.getTime();
    const elapsedFraction = Math.min(Math.max(elapsedMs / WINDOW_MS, 0), 1);

    // 1. Atomic upsert on the current window - never caught, so store outages propagate.
    const upsertRows = await prisma.$queryRaw<Array<{ count: number }>>`
      INSERT INTO "LogoFetchWindow" ("userId", "windowStart", "count")
      VALUES (${userId}, ${windowStart}, 1)
      ON CONFLICT ("userId", "windowStart")
      DO UPDATE SET "count" = "LogoFetchWindow"."count" + 1
      RETURNING "count"
    `;
    const currentCount = Number(upsertRows[0]?.count ?? 1);

    // 2. Read the previous window for the sliding estimate.
    const prevRows = await prisma.$queryRaw<Array<{ count: number }>>`
      SELECT "count" FROM "LogoFetchWindow"
      WHERE "userId" = ${userId} AND "windowStart" = ${prevWindowStart}
    `;
    const prevCount = Number(prevRows[0]?.count ?? 0);

    // 3. Sliding-window estimate.
    const estimate = prevCount * (1 - elapsedFraction) + currentCount;

    // 4. Opportunistic cleanup, scoped to the caller only (best-effort, errors swallowed).
    try {
      await prisma.$executeRaw`
        DELETE FROM "LogoFetchWindow"
        WHERE "userId" = ${userId} AND "windowStart" < ${prevWindowStart}
      `;
    } catch (error) {
      console.log(`logo_rate_limit_cleanup_failed userId=${userId} error=${String(error)}`);
    }

    if (estimate <= LIMIT) {
      return { allowed: true };
    }

    // F-20: a refused call must not count against the window - undo this call's own increment
    // (never caught: same fails-closed rule as the upsert/read above) so a client that keeps
    // retrying doesn't ratchet the stored count up past the limit and stay locked out past its
    // own Retry-After.
    await prisma.$executeRaw`
      UPDATE "LogoFetchWindow" SET "count" = "count" - 1
      WHERE "userId" = ${userId} AND "windowStart" = ${windowStart}
    `;

    const msUntilWindowCloses = WINDOW_MS - elapsedMs;
    const retryAfterSeconds = Math.min(
      Math.max(Math.ceil(msUntilWindowCloses / 1000), 1),
      60
    );
    return { allowed: false, retryAfterSeconds };
  }

  return { consumeLogoFetch };
}

export function consumeLogoFetch(userId: string): Promise<ConsumeLogoFetchResult> {
  return createLogoRateLimiter().consumeLogoFetch(userId);
}
