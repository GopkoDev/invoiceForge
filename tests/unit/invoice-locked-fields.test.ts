// invoice-integrity T04 (spec.md §5 AC-08; ADR-0003) — the locked-field comparison for issued
// invoices. Both sides go through the write normalizers: amounts as 2-dp strings, dates as calendar
// days (a legacy instant on the same day is unchanged), lines in order, the number by its key.
// docs/features/invoice-integrity/tasks/t04-locked-field-comparison.md
import { describe, expect, it } from 'vitest';
import {
  ISSUED_INVOICE_LOCKED_MESSAGE,
  LOCKED_FIELD_MESSAGE,
  compareLockedFields,
  type LockedFieldsStored,
  type LockedFieldsSubmitted,
} from '@/lib/helpers/invoice-locked-fields';

// Prisma Decimals reach the comparison as objects with toString(); a string stands in for them.
const stored: LockedFieldsStored = {
  invoiceNumberKey: 'inv-2026-0007',
  senderProfileId: 'sp-1',
  customerId: 'cu-1',
  bankAccountId: 'ba-1',
  issueDate: new Date('2026-03-01T00:00:00.000Z'),
  currency: 'USD',
  taxRate: '20.00',
  discount: '10.00',
  shipping: '5.00',
  terms: null,
  items: [
    { productId: 'pr-1', name: 'Design', description: null, unit: 'hour', quantity: '2.00', rate: '150.00' },
    { productId: null, name: 'Hosting', description: 'March', unit: 'pcs', quantity: '1.00', rate: '30.50' },
  ],
};

function unedited(): LockedFieldsSubmitted {
  return {
    invoiceNumber: 'INV-2026-0007',
    senderProfileId: 'sp-1',
    customerId: 'cu-1',
    bankAccountId: 'ba-1',
    issueDate: new Date('2026-03-01T00:00:00.000Z'),
    currency: 'USD',
    taxRate: 20,
    discount: 10,
    shipping: 5,
    terms: '',
    items: [
      { productId: 'pr-1', productName: 'Design', description: '', unit: 'hour', quantity: 2, price: 150 },
      { productId: 'custom', productName: 'Hosting', description: 'March', unit: 'pcs', quantity: 1, price: 30.5 },
    ],
  };
}

const LOCKED = [LOCKED_FIELD_MESSAGE];

describe('compareLockedFields (AC-08)', () => {
  it('exports the contract messages', () => {
    expect(ISSUED_INVOICE_LOCKED_MESSAGE).toBe(
      'An issued invoice can only change its due date, notes, payment terms and PO number. To correct anything else, cancel it and duplicate it.'
    );
    expect(LOCKED_FIELD_MESSAGE).toBe("This field can't change on an issued invoice.");
  });

  it('an unedited issued invoice has no difference', () => {
    expect(compareLockedFields(stored, unedited())).toEqual({});
  });

  it('a legacy stored instant on the same calendar day is unchanged', () => {
    const legacy = { ...stored, issueDate: new Date('2026-03-01T12:34:00.000Z') };
    expect(compareLockedFields(legacy, unedited())).toEqual({});
  });

  it('decimal scale does not matter: "150" vs stored 150.00', () => {
    const submitted = unedited();
    submitted.items[0] = { ...submitted.items[0], price: Number('150') };
    expect(compareLockedFields({ ...stored, taxRate: '20' }, submitted)).toEqual({});
  });

  it('a number differing only in case and surrounding whitespace is unchanged', () => {
    expect(compareLockedFields(stored, { ...unedited(), invoiceNumber: '  inv-2026-0007 ' })).toEqual({});
  });

  it.each([
    ['invoiceNumber', { invoiceNumber: 'INV-2026-0008' }],
    ['senderProfileId', { senderProfileId: 'sp-2' }],
    ['customerId', { customerId: 'cu-2' }],
    ['bankAccountId', { bankAccountId: 'ba-2' }],
    ['issueDate', { issueDate: new Date('2026-03-02T00:00:00.000Z') }],
    ['currency', { currency: 'EUR' }],
    ['taxRate', { taxRate: 21 }],
    ['discount', { discount: 10.01 }],
    ['shipping', { shipping: 0 }],
    ['terms', { terms: 'Net 30' }],
  ] as const)('a changed %s is reported under its key', (key, change) => {
    expect(compareLockedFields(stored, { ...unedited(), ...change })).toEqual({ [key]: LOCKED });
  });

  it.each([
    ['productId', { productId: 'pr-9' }],
    ['productName', { productName: 'Design work' }],
    ['description', { description: 'extra' }],
    ['unit', { unit: 'day' }],
    ['quantity', { quantity: 3 }],
    ['price', { price: 150.01 }],
  ] as const)('a changed line %s is reported as items.<i>.%s', (field, change) => {
    const submitted = unedited();
    submitted.items[1] = { ...submitted.items[1], ...change };
    expect(compareLockedFields(stored, submitted)).toEqual({ [`items.1.${field}`]: LOCKED });
  });

  it('several changes give one key each', () => {
    const submitted = { ...unedited(), customerId: 'cu-2', discount: 0 };
    expect(compareLockedFields(stored, submitted)).toEqual({ customerId: LOCKED, discount: LOCKED });
  });

  it('a line added or removed is reported as items', () => {
    const fewer = { ...unedited(), items: unedited().items.slice(0, 1) };
    expect(compareLockedFields(stored, fewer)).toEqual({ items: LOCKED });
  });

  it('lines reordered are reported as items', () => {
    const reordered = { ...unedited(), items: [...unedited().items].reverse() };
    expect(compareLockedFields(stored, reordered)).toEqual({ items: LOCKED });
  });

  it('the editable fields are not compared at all', () => {
    const submitted = {
      ...unedited(),
      dueDate: new Date('2026-05-01T00:00:00.000Z'),
      notes: 'changed',
      paymentTerms: 'Net 60',
      poNumber: 'PO-1',
    };
    expect(compareLockedFields(stored, submitted)).toEqual({});
  });
});
