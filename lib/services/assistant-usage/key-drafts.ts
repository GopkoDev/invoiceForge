// T17 (ai-assistant; spec.md §5 AC-27, AC-28; ADR-0009): the per-key daily draft limit, counted in one
// row per Personal key and local day. A slot is a conditional increment inside the caller's transaction,
// so it rolls back with the invoice and parallel takes can never pass the limit.
import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/prisma';
import type { ActingFreelancer } from '@/lib/services/_shared/acting-freelancer';
import { localDayRange } from '@/lib/services/_shared/time-zone';
import { failed } from '@/lib/services/_shared/result-helpers';
import { dayToUtcDate, todayInZone, utcDateToDay } from '@/lib/helpers/calendar-day';
import { fail, ok, type ActionResult } from '@/types/result';

export const KEY_DRAFT_ALLOWANCE = 50;

export type KeyDraftSlot =
  | { ok: true }
  | {
      ok: false;
      details: { kind: 'DRAFT_LIMIT_REACHED'; created: number; allowance: number; renewsAt: string };
    };

const endOfLocalDay = (day: Date, zone: string) => {
  const key = utcDateToDay(day);
  return localDayRange(key, key, zone)[1];
};

/** Takes one of today's draft slots for the key, inside the caller's transaction. */
export async function takeKeyDraftSlot(
  tx: Prisma.TransactionClient,
  key: { id: string },
  zone: string,
  now: Date
): Promise<KeyDraftSlot> {
  const day = dayToUtcDate(todayInZone(zone, now));
  await tx.personalKeyDraftDay.createMany({
    data: [{ personalKeyId: key.id, day, created: 0, allowance: KEY_DRAFT_ALLOWANCE }],
    skipDuplicates: true,
  });
  const taken = await tx.$queryRaw<{ created: number }[]>`
    UPDATE "PersonalKeyDraftDay" SET "created" = "created" + 1
    WHERE "personalKeyId" = ${key.id} AND "day" = ${day} AND "created" < "allowance"
    RETURNING "created"`;
  if (taken.length > 0) return { ok: true };
  const row = await tx.personalKeyDraftDay.findUniqueOrThrow({
    where: { personalKeyId_day: { personalKeyId: key.id, day } },
    select: { created: true, allowance: true },
  });
  return {
    ok: false,
    details: {
      kind: 'DRAFT_LIMIT_REACHED',
      created: row.created,
      allowance: row.allowance,
      renewsAt: endOfLocalDay(day, zone).toISOString(),
    },
  };
}

/** Adds 50 to today's allowance once the key has reached it. A double click lifts once. */
export async function liftKeyDraftLimit(
  actor: ActingFreelancer,
  keyId: string,
  now: Date
): Promise<ActionResult<{ created: number; allowance: number; lastLiftedAt: string }>> {
  try {
    const day = dayToUtcDate(todayInZone(actor.timeZone, now));
    const key = await prisma.personalKey.findFirst({
      where: { id: keyId, userId: actor.userId, revokedAt: null, canCreateDrafts: true },
      select: { id: true },
    });
    if (!key) return fail('NOT_FOUND', 'Key not found.');
    const rows = await prisma.$queryRaw<{ created: number; allowance: number; lastLiftedAt: Date }[]>`
      UPDATE "PersonalKeyDraftDay" d
      SET "allowance" = d."allowance" + ${KEY_DRAFT_ALLOWANCE}, "lastLiftedAt" = ${now}
      FROM "PersonalKey" k
      WHERE d."personalKeyId" = ${key.id} AND d."day" = ${day} AND d."created" >= d."allowance"
        AND k."id" = d."personalKeyId" AND k."userId" = ${actor.userId} AND k."revokedAt" IS NULL
      RETURNING d."created", d."allowance", d."lastLiftedAt"`;
    if (rows.length === 0) return fail('CONFLICT', 'The limit can be lifted once the key has reached it.');
    const [row] = rows;
    return ok({ created: row.created, allowance: row.allowance, lastLiftedAt: row.lastLiftedAt.toISOString() });
  } catch (error) {
    return failed('Error lifting key draft limit:', error, 'Could not lift the limit. Try again.');
  }
}
