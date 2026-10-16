import 'server-only';
import type { PersonalKey } from '@prisma/client';
import { prisma } from '@/prisma';
import {
  KEY_LIMIT_MESSAGE,
  KEY_NAME_MESSAGE,
  MAX_ACTIVE_PERSONAL_KEYS,
  personalKeyCanCreateDraftsSchema,
  personalKeyNameSchema,
} from '@/lib/validations/personal-key';
import { fail, ok, type ActionFailure, type ActionResult } from '@/types/result';
import { failed, isUniqueConstraintError } from '@/lib/services/_shared/result-helpers';
import { notFoundIfNoneAffected } from '@/lib/services/_shared/owner-scope';
import type { ActingFreelancer } from '@/lib/services/_shared/acting-freelancer';
import { dayToUtcDate, todayInZone } from '@/lib/helpers/calendar-day';
import { generatePersonalKey } from './key-format';
import type {
  CreatedPersonalKey,
  DraftsToday,
  PersonalKeyList,
  PersonalKeySummary,
  RevokedPersonalKeySummary,
} from '@/types/personal-key/types';

export type { CreatedPersonalKey, PersonalKeySummary, RevokedPersonalKeySummary, PersonalKeyList };

const KEY_NOT_FOUND = 'Key not found.';
const nameRefusal = () => fail('VALIDATION', KEY_NAME_MESSAGE, { fieldErrors: { name: [KEY_NAME_MESSAGE] } });

// digest and activeNameKey never leave this module.
function summarize(row: PersonalKey): CreatedPersonalKey {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    lastFour: row.lastFour,
    canCreateDrafts: row.canCreateDrafts,
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
  };
}

export async function createPersonalKey(
  actor: ActingFreelancer,
  input: { name: string; canCreateDrafts?: boolean },
): Promise<ActionResult<{ key: CreatedPersonalKey; fullKey: string }>> {
  try {
    const parsed = personalKeyNameSchema.safeParse(input?.name);
    if (!parsed.success) return nameRefusal();
    const name = parsed.data;
    const canCreateDrafts = personalKeyCanCreateDraftsSchema.safeParse(input?.canCreateDrafts ?? false);
    if (!canCreateDrafts.success) return fail('VALIDATION', 'Invalid Draft permission.');
    const activeNameKey = name.toLowerCase();
    const { fullKey, digest, lastFour } = generatePersonalKey();

    const outcome = await prisma.$transaction(async (tx): Promise<ActionFailure | PersonalKey> => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'personal-key:' + actor.userId}::text))`;

      // Name match first: with a duplicate name and 10 active keys the name refusal wins.
      const sameName = await tx.personalKey.findFirst({
        where: { userId: actor.userId, activeNameKey },
        select: { id: true },
      });
      if (sameName) return nameRefusal();

      const active = await tx.personalKey.count({ where: { userId: actor.userId, revokedAt: null } });
      if (active >= MAX_ACTIVE_PERSONAL_KEYS) return fail('CONFLICT', KEY_LIMIT_MESSAGE);

      return tx.personalKey.create({
        data: { userId: actor.userId, name, activeNameKey, digest, lastFour, canCreateDrafts: canCreateDrafts.data },
      });
    });

    if ('success' in outcome) return outcome;
    return ok({ key: summarize(outcome), fullKey });
  } catch (error) {
    if (isUniqueConstraintError(error)) return nameRefusal();
    return failed('Error creating personal key:', error, 'Could not create the key. Try again.');
  }
}

export async function revokePersonalKey(actor: ActingFreelancer, id: string): Promise<ActionResult<void>> {
  try {
    const { count } = await prisma.personalKey.updateMany({
      where: { id, userId: actor.userId, revokedAt: null },
      data: { revokedAt: new Date(), activeNameKey: null },
    });
    return notFoundIfNoneAffected(count, KEY_NOT_FOUND) ?? ok();
  } catch (error) {
    return failed('Error revoking personal key:', error, 'Could not revoke the key. Try again.');
  }
}

const DAILY_KEY_DRAFTS = 50;

/** Today's counts per key in the owner's zone; no row today means 0 of 50 with the latest earlier lift. */
async function draftsTodayFor(
  keyIds: string[],
  zone: string,
  now: Date
): Promise<Map<string, DraftsToday>> {
  const result = new Map<string, DraftsToday>();
  if (keyIds.length === 0) return result;
  const day = dayToUtcDate(todayInZone(zone, now));
  const [todayRows, lifts] = await Promise.all([
    prisma.personalKeyDraftDay.findMany({ where: { personalKeyId: { in: keyIds }, day } }),
    prisma.personalKeyDraftDay.findMany({
      where: { personalKeyId: { in: keyIds }, lastLiftedAt: { not: null } },
      orderBy: { lastLiftedAt: 'desc' },
      select: { personalKeyId: true, lastLiftedAt: true },
    }),
  ]);
  const latestLift = new Map<string, Date>();
  for (const l of lifts) if (l.lastLiftedAt && !latestLift.has(l.personalKeyId)) latestLift.set(l.personalKeyId, l.lastLiftedAt);
  const todayBy = new Map(todayRows.map((r) => [r.personalKeyId, r]));
  for (const id of keyIds) {
    const row = todayBy.get(id);
    const lifted = row?.lastLiftedAt ?? latestLift.get(id) ?? null;
    result.set(id, {
      created: row?.created ?? 0,
      allowance: row?.allowance ?? DAILY_KEY_DRAFTS,
      lastLiftedAt: lifted ? lifted.toISOString() : null,
    });
  }
  return result;
}

export async function listPersonalKeys(actor: ActingFreelancer): Promise<ActionResult<PersonalKeyList>> {
  try {
    const rows = await prisma.personalKey.findMany({
      where: { userId: actor.userId },
      orderBy: { createdAt: 'desc' },
    });
    const drafts = await draftsTodayFor(
      rows.filter((r) => !r.revokedAt && r.canCreateDrafts).map((r) => r.id),
      actor.timeZone,
      new Date(),
    );
    const active: PersonalKeySummary[] = [];
    const revoked: RevokedPersonalKeySummary[] = [];
    for (const row of rows) {
      if (row.revokedAt) revoked.push({ ...summarize(row), revokedAt: row.revokedAt.toISOString() });
      else active.push({ ...summarize(row), draftsToday: drafts.get(row.id) ?? null });
    }
    return ok({ active, revoked });
  } catch (error) {
    return failed('Error listing personal keys:', error, 'Failed to load your keys. Please try again.');
  }
}

export async function hasUsedAnyPersonalKey(actor: ActingFreelancer): Promise<ActionResult<boolean>> {
  try {
    const used = await prisma.personalKey.findFirst({
      where: { userId: actor.userId, lastUsedAt: { not: null } },
      select: { id: true },
    });
    return ok(used !== null);
  } catch (error) {
    return failed('Error checking personal key use:', error, 'Something went wrong. Please try again.');
  }
}
