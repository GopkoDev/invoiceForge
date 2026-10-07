// T40 (review-2026-10-05-r2 H-05; spec.md §5 AC-12, AC-23b) — the server-action and service schema
// accept only a `yyyy-MM-dd` calendar day; a Date (which would silently keep its UTC day) is refused.
import { describe, expect, it } from 'vitest';
import { invoiceFormSchema } from '@/lib/validations/invoice';

const base = {
  invoiceNumber: '',
  status: 'PENDING',
  senderProfileId: 's',
  bankAccountId: 'b',
  customerId: 'c',
  currency: 'USD',
  items: [{ id: 'i', productName: 'W', unit: 'pcs', quantity: 1, price: 1, total: 1 }],
};

describe('invoiceFormSchema calendar days (T40, H-05)', () => {
  it('accepts yyyy-MM-dd strings', () => {
    const r = invoiceFormSchema.safeParse({ ...base, issueDate: '2026-10-01', dueDate: '2026-10-15' });
    expect(r.success).toBe(true);
  });

  it('refuses a Date for the issue date and for the due date', () => {
    const r = invoiceFormSchema.safeParse({
      ...base,
      issueDate: new Date('2026-10-14T21:00:00.000Z'),
      dueDate: new Date('2026-10-14T21:00:00.000Z'),
    });
    expect(r.success).toBe(false);
  });
});
