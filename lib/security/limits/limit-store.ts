// LimitEvent store (ADR-0002, ADR-0007): exact sliding-window counts under a per-key advisory
// lock. All times come from the injected clock; no now() in SQL. Errors never carry raw values.
import type {
  LimitOutcome,
  LimitScope,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { scopeConfig } from './scopes';

export interface Clock {
  now(): Date;
}

export class LimitStoreUnavailable extends Error {
  constructor() {
    super('Limit store unavailable');
    this.name = 'LimitStoreUnavailable';
  }
}

export interface LimitStoreOverrides {
  prisma?: PrismaClient;
  clock?: Clock;
}

export interface LockedLimit {
  countInWindow(): Promise<number>;
  record(
    outcome: LimitOutcome,
    opts?: { userId?: string }
  ): Promise<{ id: string }>;
  oldestCountedAt(): Promise<Date | null>;
  retryAt(): Promise<Date | null>;
  markFailed(id: string): Promise<void>;
  /** True when a row with `outcome` exists with from <= at < to. */
  existsBetween(outcome: LimitOutcome, from: Date, to: Date): Promise<boolean>;
  /** Inserts a row stamped with the caller's `at` (no purge). */
  recordAt(outcome: LimitOutcome, at: Date): Promise<void>;
}

const HOUR_MS = 60 * 60_000;
export const utcHourStart = (at: Date): Date =>
  new Date(Math.floor(at.getTime() / HOUR_MS) * HOUR_MS);

const DAY_MS = 24 * 60 * 60_000;
const PURGE_BATCH = 100;

/** Runs one store DB call; any failure becomes the typed, value-free LimitStoreUnavailable. */
async function guard<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch {
    throw new LimitStoreUnavailable();
  }
}

export function createLimitStore(overrides: LimitStoreOverrides = {}) {
  const clock: Clock = overrides.clock ?? { now: () => new Date() };
  const getPrisma = async (): Promise<PrismaClient> =>
    overrides.prisma ?? (await import('@/prisma')).prisma;

  function locked(
    tx: Prisma.TransactionClient,
    scope: LimitScope,
    key: string
  ): LockedLimit {
    const { windowMs, countedOutcomes } = scopeConfig(scope);
    const counted = () => ({
      scope,
      key,
      outcome: { in: countedOutcomes },
      at: { gt: new Date(clock.now().getTime() - windowMs) },
    });
    const oldestCountedAt = async () => {
      const row = await guard(() =>
        tx.limitEvent.findFirst({
          where: counted(),
          orderBy: { at: 'asc' },
          select: { at: true },
        })
      );
      return row?.at ?? null;
    };
    return {
      countInWindow: () =>
        guard(() => tx.limitEvent.count({ where: counted() })),
      async record(outcome, opts = {}) {
        const now = clock.now();
        const cutoff = new Date(now.getTime() - DAY_MS);
        return guard(async () => {
          const row = await tx.limitEvent.create({
            data: { scope, key, outcome, at: now, userId: opts.userId ?? null },
            select: { id: true },
          });
          await tx.$executeRaw`DELETE FROM "LimitEvent" WHERE "id" IN (SELECT "id" FROM "LimitEvent" WHERE "at" < ${cutoff} LIMIT ${PURGE_BATCH})`;
          return row;
        });
      },
      oldestCountedAt,
      async retryAt() {
        const oldest = await oldestCountedAt();
        return oldest ? new Date(oldest.getTime() + windowMs) : null;
      },
      existsBetween: async (outcome, from, to) =>
        (await guard(() =>
          tx.limitEvent.count({
            where: { scope, key, outcome, at: { gte: from, lt: to } },
          })
        )) > 0,
      async recordAt(outcome, at) {
        await guard(() =>
          tx.limitEvent.create({ data: { scope, key, outcome, at } })
        );
      },
      async markFailed(id) {
        await guard(() =>
          tx.limitEvent.updateMany({
            where: { id, outcome: 'STARTED' },
            data: { outcome: 'FAILED' },
          })
        );
      },
    };
  }

  return {
    async withKeyLock<T>(
      scope: LimitScope,
      key: string,
      fn: (limit: LockedLimit) => Promise<T>
    ): Promise<T> {
      // The store's own DB calls throw LimitStoreUnavailable themselves (guard); only a
      // genuine caller-callback error is re-thrown as-is. Lock, connect and commit failures
      // are wrapped here.
      let callbackFailed = false;
      try {
        const prisma = await getPrisma();
        return await prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${scope}::text || ':' || ${key}::text))`;
          try {
            return await fn(locked(tx, scope, key));
          } catch (error) {
            callbackFailed = true;
            throw error;
          }
        });
      } catch (error) {
        if (callbackFailed || error instanceof LimitStoreUnavailable)
          throw error;
        throw new LimitStoreUnavailable();
      }
    },

    /** Records one SIGNIN_ADDRESS/REFUSED row per address per UTC hour; true when inserted. */
    async recordAddressRefusal(digest: string, at: Date): Promise<boolean> {
      return this.withKeyLock('SIGNIN_ADDRESS', digest, async (limit) => {
        const start = utcHourStart(at);
        if (
          await limit.existsBetween(
            'REFUSED',
            start,
            new Date(start.getTime() + HOUR_MS)
          )
        ) {
          return false;
        }
        await limit.recordAt('REFUSED', at);
        return true;
      });
    },

    /** Global purge of rows older than 24 h; returns the number deleted (for the cron). */
    async purgeOlderThan24h(): Promise<number> {
      const cutoff = new Date(clock.now().getTime() - DAY_MS);
      try {
        const prisma = await getPrisma();
        return await prisma.$executeRaw`DELETE FROM "LimitEvent" WHERE "at" < ${cutoff}`;
      } catch {
        throw new LimitStoreUnavailable();
      }
    },
  };
}
