import 'server-only';
import type { PersonalKey } from '@prisma/client';
import { prisma } from '@/prisma';
import {
  KEY_LIMIT_MESSAGE,
  KEY_NAME_MESSAGE,
  MAX_ACTIVE_PERSONAL_KEYS,
  personalKeyNameSchema,
} from '@/lib/validations/personal-key';
import { fail, ok, type ActionFailure, type ActionResult } from '@/types/result';
import { failed, isUniqueConstraintError } from '@/lib/services/_shared/result-helpers';
import { notFoundIfNoneAffected } from '@/lib/services/_shared/owner-scope';
import type { ActingFreelancer } from '@/lib/services/_shared/acting-freelancer';
import { generatePersonalKey } from './key-format';

export type PersonalKeySummary = {
  id: string;
  name: string;
  createdAt: string;
  lastFour: string;
  lastUsedAt: string | null;
};
export type RevokedPersonalKeySummary = PersonalKeySummary & { revokedAt: string };
export type PersonalKeyList = { active: PersonalKeySummary[]; revoked: RevokedPersonalKeySummary[] };

const KEY_NOT_FOUND = 'Key not found.';
const nameRefusal = () => fail('VALIDATION', KEY_NAME_MESSAGE, { fieldErrors: { name: [KEY_NAME_MESSAGE] } });

// digest and activeNameKey never leave this module.
function summarize(row: PersonalKey): PersonalKeySummary {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    lastFour: row.lastFour,
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
  };
}

export async function createPersonalKey(
  actor: ActingFreelancer,
  input: { name: string },
): Promise<ActionResult<{ key: PersonalKeySummary; fullKey: string }>> {
  try {
    const parsed = personalKeyNameSchema.safeParse(input?.name);
    if (!parsed.success) return nameRefusal();
    const name = parsed.data;
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
        data: { userId: actor.userId, name, activeNameKey, digest, lastFour },
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

export async function listPersonalKeys(actor: ActingFreelancer): Promise<ActionResult<PersonalKeyList>> {
  try {
    const rows = await prisma.personalKey.findMany({
      where: { userId: actor.userId },
      orderBy: { createdAt: 'desc' },
    });
    const active: PersonalKeySummary[] = [];
    const revoked: RevokedPersonalKeySummary[] = [];
    for (const row of rows) {
      if (row.revokedAt) revoked.push({ ...summarize(row), revokedAt: row.revokedAt.toISOString() });
      else active.push(summarize(row));
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
