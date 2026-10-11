// T08 (ai-assistant; spec.md §5 AC-09, AC-10, AC-10b, AC-11, §8 time-zone rule; ADR-0009): the Daily
// message allowance, counted in one row per Freelancer and local day. A reservation is a conditional
// increment, so simultaneous sends can never pass the limit; a system-side failure gives the slot back.
import 'server-only';
import type { ActingFreelancer } from '@/lib/services/_shared/acting-freelancer';
import { localDayRange } from '@/lib/services/_shared/time-zone';
import { dayToUtcDate, todayInZone, utcDateToDay } from '@/lib/helpers/calendar-day';
import { redactError } from '@/lib/helpers/prisma-error-scrub';

export const ALLOWANCE_LIMIT = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export type AllowanceState = {
  limit: 30;
  used: number;
  left: number;
  renewsAt: string;
  timeZone: string;
};

export type AllowanceDayRow = { day: Date; used: number; timeZone: string; firstMessageAt: Date };

export type ReserveResult =
  | { ok: true; state: AllowanceState; release: () => Promise<AllowanceState> }
  | { ok: false; usedUp: { kind: 'ALLOWANCE_USED_UP'; limit: 30; renewsAt: string; timeZone: string } }
  | { ok: false; unavailable: true };

const endOfLocalDay = (day: Date, zone: string) => {
  const key = utcDateToDay(day);
  return localDayRange(key, key, zone)[1];
};

/**
 * Which allowance day `now` belongs to. A new day starts at the local midnight of `zone`; when the
 * zone differs from the one the latest row was opened with, a new day also needs 24 h since that
 * row's first message, so changing the zone never earns an earlier fresh allowance.
 */
export function currentAllowanceDay(
  latest: Pick<AllowanceDayRow, 'day' | 'timeZone' | 'firstMessageAt'> | null,
  zone: string,
  now: Date
): { day: Date; isNew: boolean; renewsAt: Date } {
  const localDay = dayToUtcDate(todayInZone(zone, now));
  if (!latest) return { day: localDay, isNew: true, renewsAt: endOfLocalDay(localDay, zone) };
  if (localDay.getTime() <= latest.day.getTime()) {
    return { day: latest.day, isNew: false, renewsAt: endOfLocalDay(latest.day, zone) };
  }
  if (latest.timeZone !== zone) {
    const mark = new Date(latest.firstMessageAt.getTime() + DAY_MS);
    if (now.getTime() < mark.getTime()) return { day: latest.day, isNew: false, renewsAt: mark };
  }
  return { day: localDay, isNew: true, renewsAt: endOfLocalDay(localDay, zone) };
}

const stateOf = (used: number, renewsAt: Date, timeZone: string): AllowanceState => ({
  limit: ALLOWANCE_LIMIT,
  used,
  left: Math.max(0, ALLOWANCE_LIMIT - used),
  renewsAt: renewsAt.toISOString(),
  timeZone,
});

// Lazy: the pure day logic above must load without DATABASE_URL (same reason as _shared/time-zone.ts).
const db = async () => (await import('@/prisma')).prisma;

const latestRow = async (userId: string) =>
  (await db()).messageAllowanceDay.findFirst({
    where: { userId },
    orderBy: { day: 'desc' },
    select: { day: true, used: true, timeZone: true, firstMessageAt: true },
  });

/** Read-only: how much of today's allowance is used. Writes nothing. */
export async function getAllowanceState(
  actor: ActingFreelancer
): Promise<{ success: true; data: AllowanceState } | { success: false; error: string }> {
  try {
    const latest = await latestRow(actor.userId);
    const cur = currentAllowanceDay(latest, actor.timeZone, new Date());
    const used = latest && !cur.isNew ? latest.used : 0;
    return { success: true, data: stateOf(used, cur.renewsAt, actor.timeZone) };
  } catch (error) {
    console.error('[getAllowanceState] failed:', redactError(error));
    return { success: false, error: 'Could not read the daily message allowance' };
  }
}

/** Takes one slot of today's allowance, or says it is used up. Fails closed on any database error. */
export async function reserveMessageSlot(actor: ActingFreelancer, now: Date): Promise<ReserveResult> {
  try {
    const latest = await latestRow(actor.userId);
    const cur = currentAllowanceDay(latest, actor.timeZone, now);
    const { userId, timeZone } = actor;
    const prisma = await db();
    if (cur.isNew) {
      await prisma.messageAllowanceDay.createMany({
        data: [{ userId, day: cur.day, used: 0, timeZone, firstMessageAt: now }],
        skipDuplicates: true,
      });
    }
    const rows = await prisma.$queryRaw<{ used: number }[]>`
      UPDATE "MessageAllowanceDay" SET "used" = "used" + 1
      WHERE "userId" = ${userId} AND "day" = ${cur.day} AND "used" < ${ALLOWANCE_LIMIT}
      RETURNING "used"`;
    if (rows.length === 0) {
      return {
        ok: false,
        usedUp: { kind: 'ALLOWANCE_USED_UP', limit: 30, renewsAt: cur.renewsAt.toISOString(), timeZone },
      };
    }
    let released = false;
    let after: AllowanceState | undefined;
    const release = async (): Promise<AllowanceState> => {
      if (released && after) return after;
      released = true;
      const back = await prisma.$queryRaw<{ used: number }[]>`
        UPDATE "MessageAllowanceDay" SET "used" = "used" - 1
        WHERE "userId" = ${userId} AND "day" = ${cur.day} AND "used" > 0
        RETURNING "used"`;
      const used =
        back[0]?.used ??
        (await prisma.messageAllowanceDay.findUnique({
          where: { userId_day: { userId, day: cur.day } },
          select: { used: true },
        }))?.used ??
        0;
      after = stateOf(used, cur.renewsAt, timeZone);
      return after;
    };
    return { ok: true, state: stateOf(rows[0].used, cur.renewsAt, timeZone), release };
  } catch (error) {
    console.error('[reserveMessageSlot] failed:', redactError(error));
    return { ok: false, unavailable: true };
  }
}
