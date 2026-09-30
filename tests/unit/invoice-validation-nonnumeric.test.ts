// T41 — N-01 (review-2026-09-28.md, AC-14): a NaN left by a non-numeric entry in an editor
// number field must fail with a contract message ("... must be a number."), not zod's default
// "Expected number, received nan".
import { describe, expect, it } from 'vitest';
import { invoiceFormSchema } from '@/lib/validations/invoice';

const base = {
  senderProfileId: 's',
  bankAccountId: 'b',
  customerId: 'c',
  issueDate: '2026-01-01',
  dueDate: '2026-01-31',
  currency: 'USD',
  items: [{ id: 'i', productName: 'W', unit: 'pcs', quantity: 1, price: 1, total: 1 }],
};

function messages(overrides: Record<string, unknown>, itemOverrides: Record<string, unknown> = {}) {
  const result = invoiceFormSchema.safeParse({
    ...base,
    items: [{ ...base.items[0], ...itemOverrides }],
    ...overrides,
  });
  const out: Record<string, string[]> = {};
  if (result.success) return out;
  for (const issue of result.error.issues) (out[issue.path.join('.')] ??= []).push(issue.message);
  return out;
}

describe('non-numeric amounts get contract messages (N-01)', () => {
  it.each([
    ['discount', 'Discount must be a number.'],
    ['shipping', 'Shipping must be a number.'],
    ['taxRate', 'Tax rate must be a number.'],
  ])('%s NaN', (field, message) => {
    expect(messages({ [field]: NaN })[field]).toEqual([message]);
  });

  it('item quantity and price NaN', () => {
    const m = messages({}, { quantity: NaN, price: NaN });
    expect(m['items.0.quantity']).toEqual(['Quantity must be a number.']);
    expect(m['items.0.price']).toEqual(['Price must be a number.']);
  });
});
