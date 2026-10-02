// T12 (spec.md §5 AC-06, AC-07, AC-09) — normalizeInvoiceNumber and formatInvoiceNumber, the
// pure helpers behind the row-locked allocator.
//
// docs/features/architecture-hardening/tasks/t12-numbering-module.md, Inlined context
// ("Hard rule: Normalization parity", data-model.md §Pre-flight queries, abridged) + DoD
// ("normalizeInvoiceNumber(" INV-001 ") === normalizeInvoiceNumber("inv-001")"), and
// test-plan.md row:
//   - AC-06 "empty number field means system-assigned and a filled one means manual" (unit,
//     partial: the key format itself; the empty/filled decision lives in the caller, T13)
//   - AC-08 "numbers equal ignoring case and surrounding spaces normalize to one key" (unit)
//
// Normalization parity (data-model.md, verbatim): the backfill migration
// (prisma/migrations/20260927100100_backfill_invoice_number_key/migration.sql) computes
// `lower(regexp_replace(invoiceNumber, '^\s+|\s+$', '', 'g'))` in Postgres, where Postgres's
// regex `\s` class is POSIX (space, tab, CR, LF, VT, FF) — NOT JS's `\s`, which also strips
// Unicode whitespace (e.g. NBSP). normalizeInvoiceNumber() must produce the same key, so it
// must use the POSIX-only character class the task file spells out
// (`s.replace(/^[ \t\n\r\v\f]+|[ \t\n\r\v\f]+$/g, '').toLowerCase()`), not `String.prototype.trim()`.
//
// Assumed API (task file §API contract, verbatim): `normalizeInvoiceNumber(s)`,
// `formatInvoiceNumber(prefix, n)`. formatInvoiceNumber's exact template isn't specified in the
// task file beyond "move the number format out of generateInvoiceNumber" (checklist); this test
// assumes it preserves today's format in lib/actions/invoice-actions/invoice-actions.ts:75,
// `${prefix}-${currentYear}-${String(n).padStart(4, '0')}`, since T12 only relocates the format,
// it does not redesign it.
//
// RED (T12 not yet implemented): lib/services/invoices/numbering.ts does not exist yet, so
// this import fails to resolve.
import { describe, expect, it } from 'vitest';
import { normalizeInvoiceNumber, formatInvoiceNumber } from '@/lib/services/invoices/numbering';

describe('normalizeInvoiceNumber (AC-08, POSIX-whitespace parity with migration 03)', () => {
  it.each([
    ['INV-001', 'inv-001'],
    [' INV-001 ', 'inv-001'],
    ['Inv-001\t', 'inv-001'],
    ['\tINV-001', 'inv-001'],
    ['INV-001\r\n', 'inv-001'],
    ['\vINV-001\f', 'inv-001'],
    // internal whitespace is kept, only leading/trailing is trimmed
    ['  INV 001  ', 'inv 001'],
    ['INV-2026-0007', 'inv-2026-0007'],
  ])('normalizes %j to %j', (input, expected) => {
    expect(normalizeInvoiceNumber(input)).toBe(expected);
  });

  it('DoD: " INV-001 " and "inv-001" normalize to the same key', () => {
    expect(normalizeInvoiceNumber(' INV-001 ')).toBe(normalizeInvoiceNumber('inv-001'));
  });

  it('does NOT strip Unicode whitespace (NBSP) the way JS trim() would — POSIX \\s only', () => {
    // U+00A0 (NBSP) is Unicode whitespace but outside Postgres's POSIX \s class, so the
    // migration backfill left it untouched. normalizeInvoiceNumber must match, not use trim().
    const withNbsp = ' INV-001 ';
    expect(normalizeInvoiceNumber(withNbsp)).toBe(' inv-001 ');
  });

  it('trims only leading/trailing whitespace runs, not a run that starts partway through', () => {
    expect(normalizeInvoiceNumber('   ')).toBe('');
  });
});

describe('formatInvoiceNumber', () => {
  it('formats a prefix and counter into the invoice number shape used across the app', () => {
    const year = new Date().getFullYear();
    expect(formatInvoiceNumber('INV', 7)).toBe(`INV-${year}-0007`);
  });

  it('pads the counter to 4 digits and does not truncate a larger one', () => {
    const year = new Date().getFullYear();
    expect(formatInvoiceNumber('INV', 1)).toBe(`INV-${year}-0001`);
    expect(formatInvoiceNumber('INV', 12345)).toBe(`INV-${year}-12345`);
  });
});
