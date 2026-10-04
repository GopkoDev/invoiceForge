// T25 (spec.md §1, §5 AC-12, AC-23b; review-2026-10-05 F-02) — invoiceFormSchema stores the issue
// and due dates as calendar days: `yyyy-MM-dd` becomes T00:00:00Z, and a Date loses any time of day.
import { describe, expect, it } from 'vitest';
import { invoiceFormSchema } from '@/lib/validations/invoice';

function payload(overrides: Record<string, unknown> = {}) {
  return {
    invoiceNumber: '',
    status: 'DRAFT',
    senderProfileId: 'sp',
    bankAccountId: 'ba',
    customerId: 'c',
    issueDate: '2026-10-01',
    dueDate: '2026-10-15',
    currency: 'USD',
    items: [{ id: 'i1', productId: '', productName: 'W', description: '', unit: 'pcs', quantity: 1, price: 10, total: 10 }],
    taxRate: 0,
    discount: 0,
    shipping: 0,
    ...overrides,
  };
}

describe('invoiceFormSchema calendar days (T25)', () => {
  it('a yyyy-MM-dd day is stored at T00:00:00Z', () => {
    const r = invoiceFormSchema.parse(payload());
    expect(r.issueDate.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(r.dueDate.toISOString()).toBe('2026-10-15T00:00:00.000Z');
  });

  it('a Date keeps only its UTC calendar day', () => {
    const r = invoiceFormSchema.parse(payload({ dueDate: new Date('2026-10-15T13:45:10.000Z') }));
    expect(r.dueDate.toISOString()).toBe('2026-10-15T00:00:00.000Z');
  });

  it.each(['2026-02-30', '15/10/2026', '2026-10-15T21:00:00.000Z', '', 'tomorrow'])('refuses %j as a day', (bad) => {
    const r = invoiceFormSchema.safeParse(payload({ dueDate: bad }));
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some((i) => i.path[0] === 'dueDate')).toBe(true);
  });

  it('refuses a missing day', () => {
    const r = invoiceFormSchema.safeParse(payload({ issueDate: undefined }));
    expect(r.success).toBe(false);
  });
});
