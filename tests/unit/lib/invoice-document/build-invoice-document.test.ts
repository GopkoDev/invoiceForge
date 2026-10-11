// T9 (AC-09, AC-10; ADR-0002) — buildInvoiceDocument(): the one pure model that decides every label,
// line, formatted day and formatted amount the preview and the PDF show. No React, no react-pdf.
//
// API pinned here (implementer: lib/invoice-document/index.ts, types.ts, wording.ts):
//   buildInvoiceDocument(source: InvoiceDocumentSource): InvoiceDocument
//   InvoiceDocumentSource =
//     | { kind: 'draft'; form: InvoiceFormData; parties: { senderProfile?: InvoiceSenderProfile;
//         customer?: InvoiceCustomer; bankAccount?: InvoiceBankAccount } }
//     | { kind: 'issued'; invoice: SerializedInvoice }   // parties come from the invoice's snapshot columns
//   InvoiceDocument = {
//     title: string; invoiceNumber: string;
//     meta: { label: string; value: string }[];            // Date, Due, then PO only when set
//     from: { title: string; lines: string[] };            // name, address, "city, country", email, "Tax ID: x"
//     to:   { title: string; lines: string[] };
//     columns: { product: string; price: string; quantity: string; amount: string };
//     lines: { name: string; description: string | null; price: string; quantity: string; amount: string }[];
//     summary: { label: string; value: string }[];         // Subtotal; Discount/Shipping/Tax only when non-zero
//     total: { label: string; value: string };
//     notes: { title: string; text: string } | null;
//     terms: { title: string; text: string } | null;
//     bank: { title: string; lines: string[] } | null;
//   }
import { afterEach, describe, expect, it } from 'vitest';
import { buildInvoiceDocument } from '@/lib/invoice-document';
import { formatMoney } from '@/lib/format';
import { computeInvoiceAmounts, decimalStringToNumber } from '@/lib/helpers/invoice-calculations';
import type {
  InvoiceBankAccount,
  InvoiceCustomer,
  InvoiceFormData,
  InvoiceSenderProfile,
  SerializedInvoice,
} from '@/types/invoice/types';

const ORIGINAL_TZ = process.env.TZ;
afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

const nbsp = (s: string) => s.replace(/ /g, ' ');

const sender: InvoiceSenderProfile = {
  id: 's1',
  name: 'Acme Studio',
  legalName: null,
  address: '1 Main St',
  city: 'Kyiv',
  country: 'Ukraine',
  postalCode: '01001',
  email: 'hi@acme.test',
  phone: null,
  taxId: 'TX-1',
  logo: null,
  invoicePrefix: 'INV',
  invoiceCounter: 1,
};
const customer: InvoiceCustomer = {
  id: 'c1',
  name: 'Globex',
  companyName: null,
  email: 'ap@globex.test',
  address: '9 Side Rd',
  city: 'Berlin',
  country: 'Germany',
  postalCode: null,
  phone: null,
  taxId: null,
  defaultCurrency: 'USD',
};
const bank: InvoiceBankAccount = {
  id: 'b1',
  senderProfileId: 's1',
  bankName: 'Bank One',
  accountName: 'Acme Studio',
  accountNumber: '123456',
  iban: 'UA00IBAN',
  swift: 'SWIFTUA',
  currency: 'USD',
  isDefault: true,
};

function makeForm(overrides: Partial<InvoiceFormData> = {}): InvoiceFormData {
  return {
    invoiceNumber: 'INV-0001',
    status: 'DRAFT',
    senderProfileId: 's1',
    bankAccountId: 'b1',
    customerId: 'c1',
    issueDate: new Date(2026, 0, 5),
    dueDate: new Date(2026, 0, 19),
    currency: 'USD',
    poNumber: '',
    paymentTerms: '',
    items: [
      { id: 'i1', productId: 'p1', productName: 'Design', description: 'Logo work', unit: 'h', quantity: 2, price: 617.25, total: 1234.5 },
    ],
    taxRate: 0,
    discount: 0,
    shipping: 0,
    notes: '',
    terms: '',
    ...overrides,
  };
}

const parties = { senderProfile: sender, customer, bankAccount: bank };

// Amounts as stored when the invoice was issued (the document prints these, never a recompute).
function storedAmounts(form: InvoiceFormData) {
  const a = computeInvoiceAmounts({
    items: form.items.map((i) => ({ quantity: i.quantity, price: i.price })),
    discount: form.discount, shipping: form.shipping, taxRate: form.taxRate,
  });
  return { subtotal: a.subtotal, taxAmount: decimalStringToNumber(a.taxAmount), total: a.total };
}

function makeIssued(form: InvoiceFormData, changedAfterIssue = false): SerializedInvoice {
  const utc = (d: Date) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const now = new Date(0);
  const invoice = {
    id: 'inv1',
    invoiceNumber: form.invoiceNumber,
    status: 'PENDING',
    senderProfileId: 's1',
    customerId: 'c1',
    bankAccountId: 'b1',
    issueDate: utc(form.issueDate),
    dueDate: utc(form.dueDate),
    currency: form.currency,
    poNumber: form.poNumber || null,
    paymentTerms: form.paymentTerms || null,
    taxRate: form.taxRate,
    discount: form.discount,
    shipping: form.shipping,
    notes: form.notes || null,
    terms: form.terms || null,
    // snapshot columns: what the invoice was issued with
    senderName: sender.name,
    senderLegalName: sender.legalName,
    senderAddress: sender.address,
    senderCity: sender.city,
    senderCountry: sender.country,
    senderPostalCode: sender.postalCode,
    senderEmail: sender.email,
    senderPhone: sender.phone,
    senderTaxId: sender.taxId,
    customerName: customer.name,
    customerCompanyName: customer.companyName,
    customerEmail: customer.email,
    customerAddress: customer.address,
    customerCity: customer.city,
    customerCountry: customer.country,
    customerPostalCode: customer.postalCode,
    customerPhone: customer.phone,
    customerTaxId: customer.taxId,
    bankName: bank.bankName,
    accountName: bank.accountName,
    bankAccountNumber: bank.accountNumber,
    bankIban: bank.iban,
    bankSwift: bank.swift,
    // current records (changed after issue when asked)
    senderProfile: { ...sender, name: changedAfterIssue ? 'Renamed Studio' : sender.name, city: changedAfterIssue ? 'Lviv' : sender.city },
    customer: { ...customer, name: changedAfterIssue ? 'Globex Renamed' : customer.name },
    bankAccount: { ...bank, bankName: changedAfterIssue ? 'Bank Two' : bank.bankName, iban: changedAfterIssue ? 'NEWIBAN' : bank.iban },
    items: form.items.map((i) => ({
      id: i.id,
      invoiceId: 'inv1',
      productId: i.productId,
      name: i.productName,
      description: i.description,
      unit: i.unit,
      quantity: i.quantity,
      rate: i.price,
      amount: i.total,
      createdAt: now,
      updatedAt: now,
    })),
    ...storedAmounts(form),
    createdAt: now,
    updatedAt: now,
  };
  return invoice as unknown as SerializedInvoice;
}

describe('buildInvoiceDocument - wording (AC-10: one owner of the text)', () => {
  const doc = buildInvoiceDocument({ kind: 'draft', form: makeForm({ poNumber: 'PO-7' }), parties });

  it('carries every fixed label so layouts hold none of their own', () => {
    expect(doc.title).toBe('INVOICE');
    expect(doc.invoiceNumber).toBe('INV-0001');
    expect(doc.from.title).toBe('From');
    expect(doc.to.title).toBe('To');
    expect(doc.columns).toEqual({ product: 'Product / Service', price: 'Price', quantity: 'Qty', amount: 'Amount' });
    expect(doc.meta.map((m) => m.label)).toEqual(['Date:', 'Due:', 'PO:']);
    expect(doc.summary[0].label).toBe('Subtotal:');
    expect(doc.total.label).toBe('TOTAL:');
    expect(doc.bank?.title).toBe('Payment Information');
  });
});

describe('buildInvoiceDocument - draft in US dollars (AC-09)', () => {
  const doc = buildInvoiceDocument({ kind: 'draft', form: makeForm(), parties });

  it('formats days as en-US calendar days', () => {
    expect(doc.meta).toEqual([
      { label: 'Date:', value: 'Jan 5, 2026' },
      { label: 'Due:', value: 'Jan 19, 2026' },
    ]);
  });

  it('formats line price and amount as $1,234.50 and the quantity with its unit', () => {
    expect(doc.lines).toEqual([
      { name: 'Design', description: 'Logo work', price: '$617.25', quantity: '2 h', amount: '$1,234.50' },
    ]);
  });

  it('shows subtotal and total in the shared money format', () => {
    expect(doc.summary).toEqual([{ label: 'Subtotal:', value: '$1,234.50' }]);
    expect(doc.total).toEqual({ label: 'TOTAL:', value: '$1,234.50' });
  });

  it('lists the sender, customer and bank blocks line by line', () => {
    expect(doc.from.lines).toEqual(['Acme Studio', '1 Main St', 'Kyiv, Ukraine', 'hi@acme.test', 'Tax ID: TX-1']);
    expect(doc.to.lines).toEqual(['Globex', '9 Side Rd', 'Berlin, Germany', 'ap@globex.test']);
    expect(doc.bank).toEqual({
      title: 'Payment Information',
      lines: ['Bank One', 'Acme Studio', 'Account number: 123456', 'IBAN: UA00IBAN', 'SWIFT: SWIFTUA'],
    });
  });
});

describe('buildInvoiceDocument - hryvnia (AC-09)', () => {
  const doc = buildInvoiceDocument({ kind: 'draft', form: makeForm({ currency: 'UAH' }), parties });

  it('shows UAH 1,234.50 with the shared separators', () => {
    expect(nbsp(doc.total.value)).toBe('UAH 1,234.50');
    expect(nbsp(doc.lines[0].amount)).toBe('UAH 1,234.50');
  });

  it('uses lib/format exactly (no second formatter)', () => {
    expect(doc.total.value).toBe(formatMoney(1234.5, 'UAH'));
    expect(doc.lines[0].price).toBe(formatMoney(617.25, 'UAH'));
  });
});

describe('buildInvoiceDocument - amounts (AC-09, ADR-0006)', () => {
  const form = makeForm({
    items: [
      { id: 'i1', productId: 'p1', productName: 'A', description: '', unit: 'h', quantity: 1, price: 100, total: 999 },
      { id: 'i2', productId: 'custom', productName: '', description: 'ignored', unit: 'pcs', quantity: 3, price: 33.33, total: 999 },
    ],
    discount: 10,
    shipping: 5,
    taxRate: 10,
  });
  const doc = buildInvoiceDocument({ kind: 'draft', form, parties });

  it('computes amounts with the shared decimal module, ignoring stale form totals', () => {
    expect(doc.lines.map((l) => l.amount)).toEqual(['$100.00', '$99.99']);
    // subtotal 199.99; tax = (199.99 - 10 + 5) * 10% = 19.499 -> 19.50; total 214.49
    expect(doc.summary).toEqual([
      { label: 'Subtotal:', value: '$199.99' },
      { label: 'Discount:', value: '-$10.00' },
      { label: 'Shipping:', value: '+$5.00' },
      { label: 'Tax (10%):', value: '$19.50' },
    ]);
    expect(doc.total.value).toBe('$214.49');
  });

  it('shows no unit on a custom line and "Untitled" for an unnamed one', () => {
    expect(doc.lines[1].name).toBe('Untitled');
    expect(doc.lines[1].quantity).toBe('3');
    expect(doc.lines[1].description).toBeNull();
    expect(doc.lines[0].description).toBeNull();
  });
});

describe('buildInvoiceDocument - rows omitted the same way for both layouts', () => {
  it('omits discount, shipping, tax, notes, terms and PO when empty or zero', () => {
    const doc = buildInvoiceDocument({ kind: 'draft', form: makeForm(), parties });
    expect(doc.summary.map((r) => r.label)).toEqual(['Subtotal:']);
    expect(doc.notes).toBeNull();
    expect(doc.terms).toBeNull();
    expect(doc.meta.map((m) => m.label)).toEqual(['Date:', 'Due:']);
  });

  it('includes notes and payment terms when set', () => {
    const doc = buildInvoiceDocument({ kind: 'draft', form: makeForm({ notes: 'Thanks', terms: 'Net 14' }), parties });
    expect(doc.notes).toEqual({ title: 'Notes', text: 'Thanks' });
    expect(doc.terms).toEqual({ title: 'Payment Terms', text: 'Net 14' });
  });
});

describe('buildInvoiceDocument - missing and legacy parties', () => {
  it('builds with no sender, customer or bank account', () => {
    const doc = buildInvoiceDocument({ kind: 'draft', form: makeForm(), parties: {} });
    expect(doc.from).toEqual({ title: 'From', lines: [] });
    expect(doc.to).toEqual({ title: 'To', lines: [] });
    expect(doc.bank).toBeNull();
  });

  it('skips absent address parts and prints a lone city or country', () => {
    const doc = buildInvoiceDocument({
      kind: 'draft',
      form: makeForm(),
      parties: {
        senderProfile: { ...sender, address: null, city: null, country: 'Ukraine', email: null, taxId: null },
        customer: { ...customer, address: null, city: 'Berlin', country: null, email: null },
        bankAccount: { ...bank, iban: null, swift: null, accountNumber: '' },
      },
    });
    expect(doc.from.lines).toEqual(['Acme Studio', 'Ukraine']);
    expect(doc.to.lines).toEqual(['Globex', 'Berlin']);
    expect(doc.bank?.lines).toEqual(['Bank One', 'Acme Studio']);
  });
});

describe('buildInvoiceDocument - days never shift with the browser zone (AC-09)', () => {
  it.each(['UTC', 'Pacific/Honolulu', 'Pacific/Kiritimati'])('draft local dates read as the same day under TZ=%s', (tz) => {
    process.env.TZ = tz;
    const doc = buildInvoiceDocument({ kind: 'draft', form: makeForm({ issueDate: new Date(2026, 2, 1), dueDate: new Date(2026, 2, 31) }), parties });
    expect(doc.meta.slice(0, 2).map((m) => m.value)).toEqual(['Mar 1, 2026', 'Mar 31, 2026']);
  });

  it.each(['UTC', 'Pacific/Honolulu', 'Pacific/Kiritimati'])('issued stored days read as the same day under TZ=%s', (tz) => {
    process.env.TZ = tz;
    const doc = buildInvoiceDocument({ kind: 'issued', invoice: makeIssued(makeForm({ issueDate: new Date(2026, 2, 1), dueDate: new Date(2026, 2, 31) })) });
    expect(doc.meta.slice(0, 2).map((m) => m.value)).toEqual(['Mar 1, 2026', 'Mar 31, 2026']);
  });
});

describe('buildInvoiceDocument - issued invoice (AC-10)', () => {
  const form = makeForm({ status: 'PENDING', poNumber: 'PO-7', taxRate: 10, discount: 10, shipping: 5, notes: 'Thanks', terms: 'Net 14' });

  it('shows the issued details after the sender, Customer and bank were changed', () => {
    const doc = buildInvoiceDocument({ kind: 'issued', invoice: makeIssued(form, true) });
    expect(doc.from.lines[0]).toBe('Acme Studio');
    expect(doc.from.lines).toContain('Kyiv, Ukraine');
    expect(doc.to.lines[0]).toBe('Globex');
    expect(doc.bank?.lines).toEqual(['Bank One', 'Acme Studio', 'Account number: 123456', 'IBAN: UA00IBAN', 'SWIFT: SWIFTUA']);
    expect(JSON.stringify(doc)).not.toMatch(/Renamed|Lviv|Bank Two|NEWIBAN/);
  });

  it('matches the draft document of the same details line by line', () => {
    const issued = buildInvoiceDocument({ kind: 'issued', invoice: makeIssued(form, true) });
    const draft = buildInvoiceDocument({ kind: 'draft', form, parties });
    expect(issued).toEqual(draft);
  });

  it('has the same amounts the invoice was issued with', () => {
    const doc = buildInvoiceDocument({ kind: 'issued', invoice: makeIssued(form) });
    // subtotal 1,234.50; tax = (1,234.50 - 10 + 5) * 10% = 122.95; total 1,352.45
    expect(doc.lines[0].amount).toBe('$1,234.50');
    expect(doc.summary.map((r) => r.value)).toEqual(['$1,234.50', '-$10.00', '+$5.00', '$122.95']);
    expect(doc.total.value).toBe('$1,352.45');
  });
});

describe('buildInvoiceDocument - sender legal name (T10)', () => {
  const legal = 'Acme Studio LLC';

  it('prints the legal name right after the name when it differs, for a draft', () => {
    const doc = buildInvoiceDocument({ kind: 'draft', form: makeForm(), parties: { ...parties, senderProfile: { ...sender, legalName: legal } } });
    expect(doc.from.lines.slice(0, 3)).toEqual(['Acme Studio', legal, '1 Main St']);
  });

  it('prints the issued snapshot legal name, not the current profile one', () => {
    const invoice = { ...makeIssued(makeForm({ status: 'PENDING' })), senderLegalName: legal } as SerializedInvoice;
    const doc = buildInvoiceDocument({ kind: 'issued', invoice });
    expect(doc.from.lines.slice(0, 2)).toEqual(['Acme Studio', legal]);
  });

  it('omits the legal name when unset or equal to the name', () => {
    for (const legalName of [null, 'Acme Studio']) {
      const doc = buildInvoiceDocument({ kind: 'draft', form: makeForm(), parties: { ...parties, senderProfile: { ...sender, legalName } } });
      expect(doc.from.lines).toEqual(['Acme Studio', '1 Main St', 'Kyiv, Ukraine', 'hi@acme.test', 'Tax ID: TX-1']);
    }
  });
});
