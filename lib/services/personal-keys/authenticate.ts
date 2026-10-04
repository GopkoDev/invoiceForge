import 'server-only';
import { prisma } from '@/prisma';
import {
  actingFreelancerFromPersonalKey,
  type ActingFreelancer,
} from '@/lib/services/_shared/acting-freelancer';
import { digestKey, isWellFormedKey } from './key-format';

export type PersonalKeyAuthResult =
  | { ok: true; actor: ActingFreelancer; keyId: string; firstSuccessPending: boolean }
  | { ok: false };

const REFUSED = { ok: false } as const;
const LAST_USE_INTERVAL_MS = 60_000;

type AuthRow = { id: string; userId: string; firstSuccessAt: Date | null; timeZone: string | null };

/**
 * The one place a presented key becomes an ActingFreelancer. Shape check first (no query for a
 * malformed key), then the digest lookup among active keys with no cache, so a revocation or an
 * account deletion applies on the next call. Every failure is the same `{ ok: false }` (AC-07).
 */
export async function authenticatePersonalKey(
  fullKey: string,
  now: Date,
): Promise<PersonalKeyAuthResult> {
  try {
    if (!isWellFormedKey(fullKey)) return REFUSED;
    const digest = digestKey(fullKey);

    const rows = await prisma.$queryRaw<AuthRow[]>`
      SELECT pk."id", pk."userId", pk."firstSuccessAt", u."timeZone"
      FROM "PersonalKey" pk
      JOIN "User" u ON u."id" = pk."userId"
      WHERE pk."digest" = ${digest} AND pk."revokedAt" IS NULL`;
    const row = rows[0];
    if (!row) return REFUSED;

    const cutoff = new Date(now.getTime() - LAST_USE_INTERVAL_MS);
    await prisma.$executeRaw`
      UPDATE "PersonalKey" SET "lastUsedAt" = ${now}
      WHERE "id" = ${row.id} AND ("lastUsedAt" IS NULL OR "lastUsedAt" <= ${cutoff})`;

    const actor = await actingFreelancerFromPersonalKey(row.userId, row.timeZone);
    return { ok: true, actor, keyId: row.id, firstSuccessPending: row.firstSuccessAt === null };
  } catch (error) {
    // Never include the key or its digest; a store failure refuses like any other miss.
    console.error('Personal key check failed:', error instanceof Error ? error.name : 'unknown');
    return REFUSED;
  }
}
