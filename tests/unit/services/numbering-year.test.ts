// invoice-integrity T07 (spec.md §5 AC-21, AC-22; sad.md §4 "Numbering year") — a system-assigned
// number takes its year from the invoice's issue date (the calendar day at T00:00:00Z, read by its
// UTC year), never from the server clock. The counter is never reset per year.
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { allocateInvoiceNumber, formatInvoiceNumber } from '@/lib/services/invoices/numbering';
import { dayToUtcDate } from '@/lib/helpers/calendar-day';

function txReturningCounter(counter: number) {
  return {
    $queryRaw: vi.fn().mockResolvedValue([{ invoiceCounter: counter, invoicePrefix: 'INV' }]),
    invoice: { findFirst: vi.fn().mockResolvedValue(null) },
  } as never;
}

describe('numbering year (AC-21, AC-22)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('AC-21: created on 2 Jan 2027 with issue date 28 Dec 2026 → INV-2026-0042', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2027-01-02T10:00:00Z'));
    expect(formatInvoiceNumber('INV', 42, dayToUtcDate('2026-12-28'))).toBe('INV-2026-0042');
    const allocated = await allocateInvoiceNumber(txReturningCounter(42), 'sp-1', 'user-1', dayToUtcDate('2026-12-28'));
    expect(allocated.invoiceNumber).toBe('INV-2026-0042');
  });

  it('AC-21: the next invoice dated in 2027 continues the counter → INV-2027-0043', async () => {
    const allocated = await allocateInvoiceNumber(txReturningCounter(43), 'sp-1', 'user-1', dayToUtcDate('2027-01-05'));
    expect(allocated.invoiceNumber).toBe('INV-2027-0043');
  });

  it('AC-22: 00:30 on 1 Jan 2027 in Kyiv (still 31 Dec 2026 in UTC), issue date 1 Jan 2027 → 2027', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-12-31T22:30:00Z'));
    const allocated = await allocateInvoiceNumber(txReturningCounter(1), 'sp-1', 'user-1', dayToUtcDate('2027-01-01'));
    expect(allocated.invoiceNumber).toBe('INV-2027-0001');
  });
});
