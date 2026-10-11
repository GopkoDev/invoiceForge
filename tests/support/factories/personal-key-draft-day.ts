// PersonalKeyDraftDay factory. day defaults to today's UTC date at 00:00 UTC; created 0, allowance 50.
// The owning PersonalKey must already exist.

import type { PersonalKeyDraftDay, PrismaClient } from '@prisma/client';

export interface CreatePersonalKeyDraftDayParams {
  personalKeyId: string;
  day?: Date;
  created?: number;
  allowance?: number;
  lastLiftedAt?: Date | null;
}

export async function createPersonalKeyDraftDay(
  prisma: PrismaClient,
  params: CreatePersonalKeyDraftDayParams
): Promise<PersonalKeyDraftDay> {
  const now = new Date();
  return prisma.personalKeyDraftDay.create({
    data: {
      personalKeyId: params.personalKeyId,
      day: params.day ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
      created: params.created ?? 0,
      allowance: params.allowance ?? 50,
      lastLiftedAt: params.lastLiftedAt ?? null,
    },
  });
}
