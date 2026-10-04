// PersonalKey factory: generates a real ifk_ key with the production generator and returns
// { row, fullKey }. Defaults: name 'Test key <n>', active (activeNameKey = lower-case name), never used.
// revoked: true sets revokedAt and clears activeNameKey together.

import type { PersonalKey, PrismaClient } from '@prisma/client';
import { generatePersonalKey } from '@/lib/services/personal-keys/key-format';

export type PersonalKeyOverrides = Partial<
  Pick<PersonalKey, 'name' | 'lastUsedAt' | 'firstSuccessAt' | 'revokedAt' | 'createdAt'>
> & { revoked?: boolean };

let counter = 0;

export async function createPersonalKey(
  prisma: PrismaClient,
  userId: string,
  overrides: PersonalKeyOverrides = {}
): Promise<{ row: PersonalKey; fullKey: string }> {
  counter += 1;
  const name = overrides.name ?? `Test key ${counter}`;
  const { fullKey, digest, lastFour } = generatePersonalKey();
  const revoked = overrides.revoked === true || overrides.revokedAt != null;
  const row = await prisma.personalKey.create({
    data: {
      userId,
      name,
      activeNameKey: revoked ? null : name.toLowerCase(),
      digest,
      lastFour,
      lastUsedAt: overrides.lastUsedAt ?? null,
      firstSuccessAt: overrides.firstSuccessAt ?? null,
      revokedAt: revoked ? (overrides.revokedAt ?? new Date()) : null,
      ...(overrides.createdAt ? { createdAt: overrides.createdAt } : {}),
    },
  });
  return { row, fullKey };
}
