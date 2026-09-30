// LogoFetchWindow factory (test-plan.md §Test data). One row per Freelancer per one-minute
// window - the sliding-window counter the per-Freelancer logo-fetch rate limiter (T04) counts
// against (data-model.md §Entities/LogoFetchWindow, ADR-0008).

import type { LogoFetchWindow, PrismaClient } from '@prisma/client';

export type LogoFetchWindowOverrides = Partial<
  Pick<LogoFetchWindow, 'userId' | 'windowStart' | 'count'>
>;

export async function createLogoFetchWindow(
  prisma: PrismaClient,
  overrides: LogoFetchWindowOverrides & Pick<LogoFetchWindow, 'userId'>
): Promise<LogoFetchWindow> {
  return prisma.logoFetchWindow.create({
    data: {
      userId: overrides.userId,
      windowStart: overrides.windowStart ?? new Date(),
      count: overrides.count ?? 0,
    },
  });
}
