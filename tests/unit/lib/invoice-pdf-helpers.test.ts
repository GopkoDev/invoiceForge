// invoice-integrity T14 (spec.md §5 AC-01, AC-03, AC-16; ADR-0001) — the PDF's sender, Customer and
// bank blocks come from the invoice's issued details (snapshot columns), never the current records;
// only the logo comes from the current sender profile. The bank block prints the account number
// always and IBAN / SWIFT only when present.
import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), warning: vi.fn(), success: vi.fn() } }));

import { prepareInvoiceDataForPdf } from '@/lib/helpers/invoice-pdf-helpers';
import { InvoicePDFDocument } from '@/components/invoice-editor/invoice-pdf-document';
import type { SerializedInvoice } from '@/types/invoice/types';
import { pdfTextRuns } from '../../support/pdf-text';

function invoice(over: Partial<SerializedInvoice> = {}): SerializedInvoice {
  return {
    id: 'inv-1',
    invoiceNumber: 'INV-2025-0001',
    senderProfileId: 'sp-1',
    customerId: 'cu-1',
    bankAccountId: 'ba-1',
    issueDate: new Date('2025-03-10T00:00:00.000Z'),
    dueDate: new Date('2025-03-24T00:00:00.000Z'),
    status: 'PAID',
    currency: 'EUR',
    poNumber: null,
    paymentTerms: null,
    notes: null,
    terms: null,
    senderName: 'Issued Sender',
    senderLegalName: 'Issued Legal LLC',
    senderTaxId: 'TAX-ISSUED',
    senderAddress: '1 Issued St',
    senderCity: 'Kyiv',
    senderCountry: 'UA',
    senderPostalCode: '01001',
    senderPhone: null,
    senderEmail: 'issued@example.test',
    senderWebsite: null,
    senderLogo: 'https://old.example.test/logo.png',
    customerName: 'Issued Customer',
    customerCompanyName: null,
    customerTaxId: null,
    customerEmail: 'customer@example.test',
    customerPhone: null,
    customerAddress: '2 Old Road',
    customerCity: 'Lviv',
    customerCountry: 'UA',
    customerPostalCode: null,
    bankName: 'Issued Bank',
    bankAccountNumber: 'ACC-0001',
    bankIban: null,
    bankSwift: null,
    accountName: 'Issued Holder',
    subtotal: 100,
    taxRate: 0,
    taxAmount: 0,
    discount: 0,
    shipping: 0,
    total: 100,
    amountPaid: 0,
    items: [
      {
        id: 'it-1',
        invoiceId: 'inv-1',
        productId: null,
        name: 'Retired service',
        description: 'Kept as free text',
        unit: 'h',
        quantity: 1,
        rate: 100,
        amount: 100,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    senderProfile: {
      id: 'sp-1',
      name: 'Current Sender',
      legalName: 'Current Legal Ltd',
      address: '9 New St',
      logo: 'https://current.example.test/logo.png',
      invoicePrefix: 'INV',
      invoiceCounter: 7,
    },
    customer: { id: 'cu-1', name: 'Current Customer', address: '9 New Road', defaultCurrency: 'EUR' },
    bankAccount: {
      id: 'ba-1',
      senderProfileId: 'sp-1',
      bankName: 'Current Bank',
      accountName: 'Current Holder',
      accountNumber: 'ACC-9999',
      iban: 'UA00 CURRENT',
      swift: 'CURRSWFT',
      currency: 'EUR',
      isDefault: true,
    },
    legacy: null,
    ...over,
  } as unknown as SerializedInvoice;
}

function printed(inv: SerializedInvoice): string[] {
  const data = prepareInvoiceDataForPdf(inv);
  return pdfTextRuns(
    createElement(InvoicePDFDocument, {
      formData: data.formData,
      senderProfile: data.senderProfile ?? undefined,
      customer: data.customer ?? undefined,
      bankAccount: data.bankAccount ?? undefined,
      subtotal: inv.subtotal,
      taxAmount: inv.taxAmount,
      total: inv.total,
    })
  );
}

describe('prepareInvoiceDataForPdf — issued details (T14)', () => {
  it('builds the sender, Customer and bank blocks from the snapshot columns, not the current records', () => {
    const data = prepareInvoiceDataForPdf(invoice());
    expect(data.senderProfile).toMatchObject({
      id: 'sp-1',
      name: 'Issued Sender',
      legalName: 'Issued Legal LLC',
      address: '1 Issued St',
      taxId: 'TAX-ISSUED',
    });
    expect(data.customer).toMatchObject({ id: 'cu-1', name: 'Issued Customer', address: '2 Old Road' });
    expect(data.bankAccount).toMatchObject({
      bankName: 'Issued Bank',
      accountName: 'Issued Holder',
      accountNumber: 'ACC-0001',
      iban: null,
      swift: null,
    });
  });

  it('takes only the logo from the current sender profile', () => {
    expect(prepareInvoiceDataForPdf(invoice()).senderProfile?.logo).toBe('https://current.example.test/logo.png');
  });

  it('prints the issued legal name and never a current value (AC-01)', () => {
    const text = printed(invoice());
    expect(text).toEqual(expect.arrayContaining(['Issued Sender', 'Issued Legal LLC', '1 Issued St', '2 Old Road']));
    expect(text.join('\n')).not.toMatch(/Current|9 New|ACC-9999|CURRSWFT/);
  });

  it('bank block without IBAN: bank name, holder, account number; no IBAN or SWIFT row (AC-03)', () => {
    const text = printed(invoice());
    expect(text).toEqual(expect.arrayContaining(['Issued Bank', 'Issued Holder', 'Account number: ACC-0001']));
    expect(text.join('\n')).not.toMatch(/IBAN|SWIFT/);
  });

  it('bank block with IBAN and SWIFT prints both after the account number', () => {
    const text = printed(invoice({ bankIban: 'UA21 3223 1300 0002', bankSwift: 'ISSUSWFT' }));
    const at = (s: string) => text.indexOf(s);
    expect(at('Account number: ACC-0001')).toBeGreaterThan(-1);
    expect(at('IBAN: UA21 3223 1300 0002')).toBeGreaterThan(at('Account number: ACC-0001'));
    expect(at('SWIFT: ISSUSWFT')).toBeGreaterThan(at('IBAN: UA21 3223 1300 0002'));
  });

  it('a legacy row with an empty account number omits that row', () => {
    expect(printed(invoice({ bankAccountNumber: '' })).join('\n')).not.toMatch(/Account number/);
  });

  it('a deleted product line prints as free text with its description (AC-16)', () => {
    const text = printed(invoice());
    expect(text).toEqual(expect.arrayContaining(['Retired service', 'Kept as free text', '100.00 EUR']));
  });
});
