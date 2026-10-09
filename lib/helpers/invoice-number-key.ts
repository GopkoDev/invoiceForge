// Pure and client-importable: the invoice-number key normalizer, shared by the numbering module
// (lib/services/invoices/numbering.ts re-exports it) and the issued-invoice locked-field comparison.

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
