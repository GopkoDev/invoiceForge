// Fixture set for the preview/PDF parity tests (editor-ux T10; spec.md §6 "PDF / preview parity").
import { buildInvoiceDocument, type InvoiceDocument } from '@/lib/invoice-document';
import { computeInvoiceAmounts, decimalStringToNumber } from '@/lib/helpers/invoice-calculations';
import type {
  InvoiceBankAccount,
  InvoiceCustomer,
  InvoiceFormData,
  InvoiceSenderProfile,
  SerializedInvoice,
} from '@/types/invoice/types';

export const sender: InvoiceSenderProfile = {
  id: 's1', name: 'Acme Studio', legalName: null, address: '1 Main St', city: 'Kyiv', country: 'Ukraine',
  postalCode: '01001', email: 'hi@acme.test', phone: null, taxId: 'TX-1', logo: null, invoicePrefix: 'INV', invoiceCounter: 1,
};
export const customer: InvoiceCustomer = {
  id: 'c1', name: 'Globex', companyName: null, email: 'ap@globex.test', address: '9 Side Rd', city: 'Berlin',
  country: 'Germany', postalCode: null, phone: null, taxId: null, defaultCurrency: 'USD',
};
export const bank: InvoiceBankAccount = {
  id: 'b1', senderProfileId: 's1', bankName: 'Bank One', accountName: 'Acme Studio', accountNumber: '123456',
  iban: 'UA00IBAN', swift: 'SWIFTUA', currency: 'USD', isDefault: true,
};

export function makeForm(over: Partial<InvoiceFormData> = {}): InvoiceFormData {
  return {
    invoiceNumber: 'INV-0001', status: 'DRAFT', senderProfileId: 's1', bankAccountId: 'b1', customerId: 'c1',
    issueDate: new Date(2026, 0, 5), dueDate: new Date(2026, 0, 19), currency: 'USD', poNumber: '', paymentTerms: '',
    items: [{ id: 'i1', productId: 'p1', productName: 'Design', description: 'Logo work', unit: 'h', quantity: 2, price: 617.25, total: 1234.5 }],
    taxRate: 0, discount: 0, shipping: 0, notes: '', terms: '',
    ...over,
  };
}

// Amounts as stored when the invoice was issued (the document prints these, never a recompute).
function storedAmounts(form: InvoiceFormData) {
  const a = computeInvoiceAmounts({
    items: form.items.map((i) => ({ quantity: i.quantity, price: i.price })),
    discount: form.discount, shipping: form.shipping, taxRate: form.taxRate,
  });
  return { subtotal: a.subtotal, taxAmount: decimalStringToNumber(a.taxAmount), total: a.total };
}

export function makeIssued(form: InvoiceFormData, changedAfterIssue = false): SerializedInvoice {
  const utc = (d: Date) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const now = new Date(0);
  return {
    id: 'inv1', invoiceNumber: form.invoiceNumber, status: 'PENDING', senderProfileId: 's1', customerId: 'c1', bankAccountId: 'b1',
    issueDate: utc(form.issueDate), dueDate: utc(form.dueDate), currency: form.currency, poNumber: form.poNumber || null,
    paymentTerms: form.paymentTerms || null, taxRate: form.taxRate, discount: form.discount, shipping: form.shipping,
    notes: form.notes || null, terms: form.terms || null,
    senderName: sender.name, senderLegalName: sender.legalName, senderAddress: sender.address, senderCity: sender.city,
    senderCountry: sender.country, senderPostalCode: sender.postalCode, senderEmail: sender.email, senderPhone: sender.phone,
    senderTaxId: sender.taxId,
    customerName: customer.name, customerCompanyName: customer.companyName, customerEmail: customer.email,
    customerAddress: customer.address, customerCity: customer.city, customerCountry: customer.country,
    customerPostalCode: customer.postalCode, customerPhone: customer.phone, customerTaxId: customer.taxId,
    bankName: bank.bankName, accountName: bank.accountName, bankAccountNumber: bank.accountNumber, bankIban: bank.iban, bankSwift: bank.swift,
    senderProfile: { ...sender, name: changedAfterIssue ? 'Renamed Studio' : sender.name, city: changedAfterIssue ? 'Lviv' : sender.city },
    customer: { ...customer, name: changedAfterIssue ? 'Globex Renamed' : customer.name },
    bankAccount: { ...bank, bankName: changedAfterIssue ? 'Bank Two' : bank.bankName, iban: changedAfterIssue ? 'NEWIBAN' : bank.iban },
    items: form.items.map((i) => ({
      id: i.id, invoiceId: 'inv1', productId: i.productId, name: i.productName, description: i.description, unit: i.unit,
      quantity: i.quantity, rate: i.price, amount: i.total, createdAt: now, updatedAt: now,
    })),
    ...storedAmounts(form),
    createdAt: now, updatedAt: now,
  } as unknown as SerializedInvoice;
}

export const parties = { senderProfile: sender, customer, bankAccount: bank };
const busy = makeForm({
  poNumber: 'PO-7', discount: 50, shipping: 20, taxRate: 10, notes: 'Thanks\nfor your business', terms: 'Net 14',
  items: [
    { id: 'i1', productId: 'p1', productName: 'Design', description: 'Logo work', unit: 'h', quantity: 2, price: 617.25, total: 1234.5 },
    { id: 'i2', productId: 'custom', productName: 'Rush fee', description: 'ignored for custom', unit: 'pcs', quantity: 3, price: 10.5, total: 31.5 },
  ],
});

export const FIXTURES: { name: string; document: InvoiceDocument }[] = [
  { name: 'draft, USD', document: buildInvoiceDocument({ kind: 'draft', form: makeForm(), parties }) },
  { name: 'draft, UAH', document: buildInvoiceDocument({ kind: 'draft', form: makeForm({ currency: 'UAH' }), parties }) },
  { name: 'draft, discount + tax + shipping + several lines', document: buildInvoiceDocument({ kind: 'draft', form: busy, parties }) },
  { name: 'draft, no bank account', document: buildInvoiceDocument({ kind: 'draft', form: makeForm(), parties: { senderProfile: sender, customer } }) },
  {
    name: 'draft, legacy address-only parties',
    document: buildInvoiceDocument({
      kind: 'draft', form: makeForm(),
      parties: { senderProfile: { ...sender, city: null, country: null, email: null, taxId: null }, customer: { ...customer, city: null, country: null, email: null }, bankAccount: bank },
    }),
  },
  { name: 'issued, USD', document: buildInvoiceDocument({ kind: 'issued', invoice: makeIssued(busy) }) },
  { name: 'issued, parties changed since', document: buildInvoiceDocument({ kind: 'issued', invoice: makeIssued(makeForm({ currency: 'UAH' }), true) }) },
];

/** The model's strings in the order both layouts must print them. */
export function modelStrings(d: InvoiceDocument): string[] {
  return [
    d.title, d.invoiceNumber,
    ...d.meta.flatMap((m) => [m.label, m.value]),
    d.from.title, ...d.from.lines, d.to.title, ...d.to.lines,
    d.columns.product, d.columns.price, d.columns.quantity, d.columns.amount,
    ...d.lines.flatMap((l) => [l.name, ...(l.description ? [l.description] : []), l.price, l.quantity, l.amount]),
    ...d.summary.flatMap((s) => [s.label, s.value]),
    d.total.label, d.total.value,
    ...(d.notes ? [d.notes.title, d.notes.text] : []),
    ...(d.terms ? [d.terms.title, d.terms.text] : []),
    ...(d.bank ? [d.bank.title, ...d.bank.lines] : []),
  ];
}

export const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
export const flat = (parts: string[]) => norm(parts.join(' '));
