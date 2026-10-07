import 'server-only';
import { prisma } from '@/prisma';
import {
  actingFreelancerFromPersonalKey,
  type ActingFreelancer,
} from '@/lib/services/_shared/acting-freelancer';
import { digestKey, isWellFormedKey } from './key-format';

export type PersonalKeyAuthResult =
  | { ok: true; actor: ActingFreelancer; keyId: string }
  | { ok: false; unavailable?: undefined }
  | { ok: false; unavailable: true };

const REFUSED = { ok: false } as const;
const UNAVAILABLE = { ok: false, unavailable: true } as const;
const LAST_USE_INTERVAL_MS = 60_000;

type AuthRow = { id: string; userId: string; timeZone: string | null };

/**
 * The one place a presented key becomes an ActingFreelancer. Shape check first (no query for a
 * malformed key), then the digest lookup among active keys with no cache, so a revocation or an
 * account deletion applies on the next call. Every refusal is the same `{ ok: false }` (AC-07); a store failure is the distinct
 * `unavailable` result, so the caller answers 503 instead of counting a refused check.
 */
export async function authenticatePersonalKey(
  fullKey: string,
  now: Date,
): Promise<PersonalKeyAuthResult> {
  try {
    if (!isWellFormedKey(fullKey)) return REFUSED;
    const digest = digestKey(fullKey);

    const rows = await prisma.$queryRaw<AuthRow[]>`
      SELECT pk."id", pk."userId", u."timeZone"
      FROM "PersonalKey" pk
      JOIN "User" u ON u."id" = pk."userId"
      WHERE pk."digest" = ${digest} AND pk."revokedAt" IS NULL`;
    const row = rows[0];
    if (!row) return REFUSED;

    const cutoff = new Date(now.getTime() - LAST_USE_INTERVAL_MS);
    try {
      await prisma.$executeRaw`
        UPDATE "PersonalKey" SET "lastUsedAt" = ${now}
        WHERE "id" = ${row.id} AND ("lastUsedAt" IS NULL OR "lastUsedAt" <= ${cutoff})`;
    } catch (error) {
      // Best effort: a missed last-use stamp never refuses a valid key.
      console.error('Personal key last use not recorded:', error instanceof Error ? error.name : 'unknown');
    }

    const actor = await actingFreelancerFromPersonalKey(row.userId, row.timeZone);
    return { ok: true, actor, keyId: row.id };
  } catch (error) {
    // Never include the key or its digest; a store failure is unavailable, not a refusal.
    console.error('Personal key check failed:', error instanceof Error ? error.name : 'unknown');
    return UNAVAILABLE;
  }
}
