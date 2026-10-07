// T12 (spec.md §5 AC-06, AC-07, AC-09) — the invoice numbering module: normalization, the shared
// number format, the row-locked allocator (ADR-0005), and the no-lock "next number" hint.
//
// docs/features/architecture-hardening/tasks/t12-numbering-module.md

import 'server-only';
import { Prisma } from '@prisma/client';
import { normalizeInvoiceNumber } from '@/lib/helpers/invoice-number-key';
import { SenderProfileNotFoundError } from './numbering-errors';

export { SenderProfileNotFoundError };

// The key normalizer is pure (lib/helpers/invoice-number-key.ts) so client-safe helpers share it.
export { normalizeInvoiceNumber };

/**
 * Formats a sender profile's prefix and a counter value into the invoice number shape shared by
 * create, duplicate and the "assigned on save" hint.
 */
export function formatInvoiceNumber(prefix: string, n: number): string {
  const year = new Date().getFullYear();
  return `${prefix}-${year}-${String(n).padStart(4, '0')}`;
}

/**
 * Whether a normalized invoice number key is already taken within a sender profile.
 *
 * Since the T30 contract step every invoice has a non-null key, so the key alone decides it: two
 * numbers count as the same whenever they normalize to the same key (AC-08/AC-09).
 */
export async function isInvoiceKeyTaken(
  tx: Prisma.TransactionClient,
  senderProfileId: string,
  key: string,
  excludeInvoiceId?: string
): Promise<boolean> {
  const existing = await tx.invoice.findFirst({
    where: {
      senderProfileId,
      invoiceNumberKey: key,
      ...(excludeInvoiceId ? { id: { not: excludeInvoiceId } } : {}),
    },
    select: { id: true },
  });
  return existing !== null;
}

/**
 * Takes the sender-profile row lock (ADR-0005) without advancing invoiceCounter, so a manually
 * typed number's uniqueness check (F-10) serializes with allocateInvoiceNumber's own lock instead
 * of racing it — a race that would otherwise surface as a spurious P2002 past the lock. The owner
 * is part of the match (ADR-0003): another Freelancer's profile locks nothing and throws
 * SenderProfileNotFoundError.
 */
export async function lockSenderProfileRow(
  tx: Prisma.TransactionClient,
  senderProfileId: string,
  userId: string
): Promise<void> {
  const rows = await tx.$queryRaw<
    unknown[]
  >`SELECT 1 FROM "SenderProfile" WHERE id = ${senderProfileId} AND "userId" = ${userId} FOR UPDATE`;
  if (rows.length === 0) {
    throw new SenderProfileNotFoundError();
  }
}

/**
 * Allocates the next free invoice number under a sender profile row lock (ADR-0005).
 *
 * Advances `invoiceCounter` via an atomic `UPDATE ... SET invoiceCounter = invoiceCounter + 1
 * ... RETURNING`, which also takes the row lock. Loops, incrementing again, while the candidate
 * key is already taken by a manually typed number (AC-09). Never inserts the invoice itself —
 * that's the caller's job, inside the same transaction. The owner is part of the `UPDATE`'s match
 * (ADR-0003): another Freelancer's profile advances nothing and throws SenderProfileNotFoundError.
 */
export async function allocateInvoiceNumber(
  tx: Prisma.TransactionClient,
  senderProfileId: string,
  userId: string
): Promise<{ invoiceNumber: string; invoiceNumberKey: string }> {
  for (;;) {
    const [profile] = await tx.$queryRaw<{ invoiceCounter: number; invoicePrefix: string }[]>`
      UPDATE "SenderProfile"
      SET "invoiceCounter" = "invoiceCounter" + 1
      WHERE id = ${senderProfileId} AND "userId" = ${userId}
      RETURNING "invoiceCounter", "invoicePrefix"
    `;
    if (!profile) {
      throw new SenderProfileNotFoundError();
    }

    const invoiceNumber = formatInvoiceNumber(profile.invoicePrefix, profile.invoiceCounter);
    const invoiceNumberKey = normalizeInvoiceNumber(invoiceNumber);

    if (await isInvoiceKeyTaken(tx, senderProfileId, invoiceNumberKey)) {
      continue;
    }

    return { invoiceNumber, invoiceNumberKey };
  }
}

/**
 * Returns the next proposed invoice number as a hint only (AC-06): computed without a lock and
 * without side effects, skipping candidates already taken by manually typed numbers. It is never
 * sent back as the number saved — that number is only ever produced by `allocateInvoiceNumber`.
 */
export async function peekNextInvoiceNumber(
  senderProfileId: string,
  userId: string
): Promise<string | null> {
  const { prisma } = await import('@/prisma');
  const profile = await prisma.senderProfile.findUnique({
    where: { id: senderProfileId, userId },
    select: { invoiceCounter: true, invoicePrefix: true },
  });

  if (!profile) {
    return null;
  }

  let counter = profile.invoiceCounter;
  for (;;) {
    counter += 1;
    const candidate = formatInvoiceNumber(profile.invoicePrefix, counter);
    const key = normalizeInvoiceNumber(candidate);
    const taken = await isInvoiceKeyTaken(prisma, senderProfileId, key);
    if (!taken) {
      return candidate;
    }
  }
}
