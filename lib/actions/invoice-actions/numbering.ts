// T12 (spec.md §5 AC-06, AC-07, AC-09) — the invoice numbering module: normalization, the shared
// number format, the row-locked allocator (ADR-0005), and the no-lock "next number" hint.
//
// docs/features/architecture-hardening/tasks/t12-numbering-module.md

import { Prisma } from '@prisma/client';

/**
 * Normalizes an invoice number to the key used for uniqueness within a sender profile.
 *
 * Parity requirement (data-model.md, "Normalization parity", Hard rule): the backfill migration
 * (prisma/migrations/20260927100100_backfill_invoice_number_key/migration.sql) computes
 * `lower(regexp_replace(invoiceNumber, '^\s+|\s+$', '', 'g'))` in Postgres, whose `\s` class is
 * POSIX-only (space, tab, CR, LF, VT, FF) — unlike JS's `String.prototype.trim()`, which also
 * strips Unicode whitespace (e.g. NBSP). This must strip only that POSIX class, not use `trim()`.
 */
export function normalizeInvoiceNumber(s: string): string {
  return s.replace(/^[ \t\n\r\v\f]+|[ \t\n\r\v\f]+$/g, '').toLowerCase();
}

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
 * NULL keys (legacy invoices written before invoiceNumberKey existed) never match: Postgres
 * treats NULL as distinct in the unique index (ADR-0004), and this check must agree.
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
 * Allocates the next free invoice number under a sender profile row lock (ADR-0005).
 *
 * Advances `invoiceCounter` via an atomic `UPDATE ... SET invoiceCounter = invoiceCounter + 1
 * ... RETURNING`, which also takes the row lock. Loops, incrementing again, while the candidate
 * key is already taken by a manually typed number (AC-09). Never inserts the invoice itself —
 * that's the caller's job, inside the same transaction.
 */
export async function allocateInvoiceNumber(
  tx: Prisma.TransactionClient,
  senderProfileId: string
): Promise<{ invoiceNumber: string; invoiceNumberKey: string }> {
  for (;;) {
    const [profile] = await tx.$queryRaw<{ invoiceCounter: number; invoicePrefix: string }[]>`
      UPDATE "SenderProfile"
      SET "invoiceCounter" = "invoiceCounter" + 1
      WHERE id = ${senderProfileId}
      RETURNING "invoiceCounter", "invoicePrefix"
    `;

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
export async function peekNextInvoiceNumber(senderProfileId: string): Promise<string | null> {
  const { prisma } = await import('@/prisma');
  const profile = await prisma.senderProfile.findUnique({
    where: { id: senderProfileId },
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
