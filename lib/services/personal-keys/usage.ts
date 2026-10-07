import 'server-only';
import { prisma } from '@/prisma';

export type PersonalKeyUsageOutcome = 'success' | 'assistant_error' | 'server_failure';

const DAY_MS = 86_400_000;

/** Monday 00:00 UTC of the week containing `now`. */
function weekStartOf(now: Date): Date {
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const sinceMonday = (now.getUTCDay() + 6) % 7;
  return new Date(midnight - sinceMonday * DAY_MS);
}

/**
 * Counts one substantive call: one atomic upsert (never a Prisma upsert, which can raise P2002
 * when two first calls of a week race) and, on the first success, `firstSuccessAt`.
 */
export async function recordPersonalKeyUsage(
  keyId: string,
  outcome: PersonalKeyUsageOutcome,
  now: Date,
): Promise<void> {
  const weekStart = weekStartOf(now);
  const success = outcome === 'success' ? 1 : 0;
  const assistantError = outcome === 'assistant_error' ? 1 : 0;

  await prisma.$executeRaw`
    INSERT INTO "PersonalKeyUsageWeek" ("personalKeyId", "weekStart", "attempts", "successes", "assistantErrors")
    VALUES (${keyId}, ${weekStart}, 1, ${success}, ${assistantError})
    ON CONFLICT ("personalKeyId", "weekStart") DO UPDATE SET
      "attempts" = "PersonalKeyUsageWeek"."attempts" + 1,
      "successes" = "PersonalKeyUsageWeek"."successes" + EXCLUDED."successes",
      "assistantErrors" = "PersonalKeyUsageWeek"."assistantErrors" + EXCLUDED."assistantErrors"`;

  if (success === 1) {
    await prisma.$executeRaw`
      UPDATE "PersonalKey" SET "firstSuccessAt" = ${now}
      WHERE "id" = ${keyId} AND "firstSuccessAt" IS NULL`;
  }
}
