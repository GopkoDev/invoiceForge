// MessageAllowanceDay factory. day defaults to today's UTC date at 00:00 UTC; used defaults to 0.

import type { MessageAllowanceDay, PrismaClient } from '@prisma/client';

export interface CreateMessageAllowanceDayParams {
  userId: string;
  day?: Date;
  used?: number;
  timeZone?: string;
  firstMessageAt?: Date;
}

export async function createMessageAllowanceDay(
  prisma: PrismaClient,
  params: CreateMessageAllowanceDayParams
): Promise<MessageAllowanceDay> {
  const now = new Date();
  return prisma.messageAllowanceDay.create({
    data: {
      userId: params.userId,
      day: params.day ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
      used: params.used ?? 0,
      timeZone: params.timeZone ?? 'UTC',
      firstMessageAt: params.firstMessageAt ?? now,
    },
  });
}
