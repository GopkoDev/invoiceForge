import 'server-only';
import type { Prisma } from '@prisma/client';

/**
 * Lazy calendar-day normalisation (spec.md §1, AC-12, AC-23b, AC-24; review-2026-10-05 G-01, ADR-0006).
 * Invoice.issueDate / dueDate are calendar days stored at T00:00:00Z, but values written before this
 * release are instants (the editor's local midnight, or a time of day). The migration converts only
 * owners whose zone is already saved; for everyone else the zone is unknown, so a legacy value is read
 * as its UTC day until the zone is first saved. That moment — User.timeZone going NULL -> value — is
 * the one place the Freelancer's legacy values are converted, in the SAME transaction as the zone write.
 * The saved zone is the "already done" marker: a later change of zone never reaches this function.
 *
 * A value already at exactly 00:00:00 UTC is a stored day and is never moved, so a second run changes
 * nothing. The expression is the one in prisma/migrations/20261005100000_normalize_invoice_calendar_dates.
 */
export async function normalizeLegacyInvoiceDates(
  tx: Prisma.TransactionClient,
  userId: string,
  timeZone: string,
): Promise<number> {
  return tx.$executeRaw`
    UPDATE "Invoice" AS i
    SET
      "issueDate" = CASE
        WHEN i."issueDate" = date_trunc('day', i."issueDate") THEN i."issueDate"
        ELSE ((i."issueDate" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}::text)::date::timestamp
      END,
      "dueDate" = CASE
        WHEN i."dueDate" = date_trunc('day', i."dueDate") THEN i."dueDate"
        ELSE ((i."dueDate" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}::text)::date::timestamp
      END
    FROM "SenderProfile" sp
    WHERE sp."id" = i."senderProfileId"
      AND sp."userId" = ${userId}
      AND (i."issueDate" <> date_trunc('day', i."issueDate") OR i."dueDate" <> date_trunc('day', i."dueDate"))`;
}
