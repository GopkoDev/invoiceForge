// T35 (spec.md §5 AC-18; review-2026-09-27.md F-15) — SCR-02 "status-changed" needs the row's
// paid date, but `paidAt` was neither selected nor shown.
//
// docs/features/architecture-hardening/tasks.json T35, cite
// lib/actions/invoice-actions/select-queries.ts:64-75.
//
// RED: invoiceListSelect does not select `paidAt`, so every list query (getInvoices,
// searchInvoices, getInvoicesByCustomer/SenderProfile) returns rows with no paid date for the
// UI to show next to the "Paid" status.
import { describe, expect, it } from 'vitest';
import { invoiceListSelect } from '@/lib/actions/invoice-actions/select-queries';

describe('invoiceListSelect (T35, AC-18, F-15)', () => {
  it('selects paidAt alongside status so the list row can show the paid date', () => {
    expect(invoiceListSelect).toHaveProperty('paidAt', true);
  });
});
