// T23 (spec.md §5 AC-26) — invoice-list link parameters are parsed with fallback-to-default
// schemas, so a malformed or tampered link never throws and always opens with a documented
// default, per docs/features/architecture-hardening/tasks/t23-invoice-list-link-params.md
// (Inlined context — contracts/server-actions.md §Link parameters, Invoice list, verbatim table;
// sad.md §8 Hard rule "Input validation") and the test-plan.md row for AC-26 (below).
//
// test-plan.md row exercised here:
//   - AC-26 "each bad list parameter falls back to its default" (unit): page=-1, page=2.5,
//     page=abc, a pageSize not offered, sortBy=items, an unknown order, status=FOO and an unknown
//     tab each give their default. Valid values pass through.
//
// Assumed API (task file §Checklist, §API contract, verbatim):
//   invoiceListParamsSchema: zod schema over Next.js searchParams-shaped input (string | string[]
//   | undefined per key), each field `.catch(default)` so a bad value never throws.
//   Defaults (contracts/server-actions.md §Link parameters table, verbatim):
//     page=1, pageSize=10, sortField='createdAt', sortDirection='desc', status='all', tab='all',
//     search='', dateFrom/dateTo=undefined (also dropped together when from > to).
//   export type InvoiceListParams — the parsed, typed shape.
// Out-of-range-beyond-last-page (?page=999) is NOT this schema's job (it doesn't know the total
// page count) — that clamp happens in getPaginatedInvoices once `total` is known (task file
// Edge cases row, Checklist item 3); only a structurally invalid `page` (negative, non-integer,
// non-numeric, missing) falls back here.
//
// RED (T23 not yet implemented): lib/validations/search-params.ts does not exist yet, so this
// suite fails to resolve the module before any assertion runs.
import { describe, expect, it } from 'vitest';
import {
  invoiceListParamsSchema,
  type InvoiceListParams,
} from '@/lib/validations/search-params';

const DEFAULTS: InvoiceListParams = {
  page: 1,
  pageSize: 10,
  sortField: 'createdAt',
  sortDirection: 'desc',
  status: 'all',
  tab: 'all',
  customerId: undefined,
  senderProfileId: undefined,
  search: '',
  dateFrom: undefined,
  dateTo: undefined,
};

describe('invoiceListParamsSchema (unit, AC-26)', () => {
  describe.each([
    ['page=-1', { page: '-1' }, { page: 1 }],
    ['page=2.5', { page: '2.5' }, { page: 1 }],
    ['page=abc', { page: 'abc' }, { page: 1 }],
    ['page=0', { page: '0' }, { page: 1 }],
    ['page missing', {}, { page: 1 }],
    ['pageSize=25 (not offered)', { pageSize: '25' }, { pageSize: 10 }],
    ['pageSize=abc', { pageSize: 'abc' }, { pageSize: 10 }],
    ['sortField=items (unknown)', { sortField: 'items' }, { sortField: 'createdAt' }],
    ['sortDirection=sideways (unknown order)', { sortDirection: 'sideways' }, { sortDirection: 'desc' }],
    ['status=FOO (unknown)', { status: 'FOO' }, { status: 'all' }],
    ['tab=x (unknown)', { tab: 'x' }, { tab: 'all' }],
    ['search longer than 100 chars', { search: 'x'.repeat(150) }, { search: 'x'.repeat(100) }],
  ] as const)('malformed %s', (_label, raw, expected) => {
    it('falls back to the documented default, never throws', () => {
      expect(() => invoiceListParamsSchema.parse(raw)).not.toThrow();
      const parsed = invoiceListParamsSchema.parse(raw);
      expect(parsed).toMatchObject(expected);
    });
  });

  it('valid values pass through unchanged', () => {
    const raw = {
      page: '3',
      pageSize: '50',
      sortField: 'total',
      sortDirection: 'asc',
      status: 'PAID',
      tab: 'final',
      search: 'acme',
      customerId: 'cust_1',
      senderProfileId: 'sender_1',
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
    };

    const parsed = invoiceListParamsSchema.parse(raw);

    expect(parsed).toMatchObject({
      page: 3,
      pageSize: 50,
      sortField: 'total',
      sortDirection: 'asc',
      status: 'PAID',
      tab: 'final',
      search: 'acme',
      customerId: 'cust_1',
      senderProfileId: 'sender_1',
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
    });
  });

  it('drops both dateFrom and dateTo when dateFrom is after dateTo (reversed range)', () => {
    const parsed = invoiceListParamsSchema.parse({
      dateFrom: '2026-10-05',
      dateTo: '2026-10-01',
    });

    expect(parsed.dateFrom).toBeUndefined();
    expect(parsed.dateTo).toBeUndefined();
  });

  it('drops a malformed dateFrom/dateTo pair instead of throwing', () => {
    expect(() =>
      invoiceListParamsSchema.parse({ dateFrom: 'not-a-date', dateTo: '2026-10-01' })
    ).not.toThrow();
    const parsed = invoiceListParamsSchema.parse({
      dateFrom: 'not-a-date',
      dateTo: '2026-10-01',
    });
    expect(parsed.dateFrom).toBeUndefined();
    expect(parsed.dateTo).toBeUndefined();
  });

  it('an empty link parses to every documented default', () => {
    const parsed = invoiceListParamsSchema.parse({});
    expect(parsed).toEqual(DEFAULTS);
  });

  it('never throws on garbage/tampered values across every field at once', () => {
    expect(() =>
      invoiceListParamsSchema.parse({
        page: '-999',
        pageSize: 'NaN',
        sortField: '__proto__',
        sortDirection: 'DESC ; DROP TABLE',
        status: '<script>',
        tab: null,
        search: 12345,
        dateFrom: '31-02-2026',
        dateTo: {},
      })
    ).not.toThrow();
  });
});
