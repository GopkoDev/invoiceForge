// PersonalKeyUsageWeek factory. weekStart defaults to Monday 00:00 UTC of the current week; all
// counts default to 0. The owning PersonalKey must already exist (fixture rows only, never a real key).

import type { PersonalKeyUsageWeek, PrismaClient } from '@prisma/client';

export type PersonalKeyUsageWeekOverrides = Partial<
  Pick<
    PersonalKeyUsageWeek,
    'weekStart' | 'attempts' | 'successes' | 'assistantErrors'
  >
> &
  Pick<PersonalKeyUsageWeek, 'personalKeyId'>;

export function mondayUtc(now: Date = new Date()): Date {
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const daysSinceMonday = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - daysSinceMonday);
  return d;
}

export async function createPersonalKeyUsageWeek(
  prisma: PrismaClient,
  overrides: PersonalKeyUsageWeekOverrides
): Promise<PersonalKeyUsageWeek> {
  return prisma.personalKeyUsageWeek.create({
    data: {
      personalKeyId: overrides.personalKeyId,
      weekStart: overrides.weekStart ?? mondayUtc(),
      attempts: overrides.attempts ?? 0,
      successes: overrides.successes ?? 0,
      assistantErrors: overrides.assistantErrors ?? 0,
    },
  });
}
