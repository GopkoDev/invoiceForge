// LimitEvent factory. Keys are HMAC-SHA256 digests under a test-only LIMIT_KEY_SECRET - never
// raw addresses. EXPORT rows require userId and use
// the same value as key.

import { createHmac } from 'node:crypto';
import type { LimitEvent, PrismaClient } from '@prisma/client';

export const TEST_LIMIT_KEY_SECRET = 'test-only-limit-key-secret';

export function limitKeyDigest(value: string): string {
  return createHmac('sha256', TEST_LIMIT_KEY_SECRET)
    .update(value)
    .digest('hex');
}

export type LimitEventOverrides = Partial<
  Pick<LimitEvent, 'scope' | 'key' | 'outcome' | 'at' | 'userId'>
>;

export async function createLimitEvent(
  prisma: PrismaClient,
  overrides: LimitEventOverrides = {}
): Promise<LimitEvent> {
  const scope = overrides.scope ?? 'SIGNIN_SOURCE';
  if (scope === 'EXPORT' && !overrides.userId) {
    throw new Error('createLimitEvent: EXPORT rows require userId');
  }
  const key =
    overrides.key ??
    (scope === 'EXPORT' ? overrides.userId! : limitKeyDigest('203.0.113.7'));
  return prisma.limitEvent.create({
    data: {
      scope,
      key,
      outcome: overrides.outcome ?? 'REQUESTED',
      at: overrides.at ?? new Date(),
      userId: overrides.userId ?? null,
    },
  });
}
