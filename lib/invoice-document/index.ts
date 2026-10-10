// T9 (AC-09, AC-10; ADR-0002) — the one pure model that decides every label, line, formatted day and
// formatted amount the preview and the PDF show. No React, no react-pdf.
import { formatDay, formatMoney } from '@/lib/format';
import { localDateToDay, dayToUtcDate } from '@/lib/helpers/calendar-day';
import { computeInvoiceAmounts, decimalStringToNumber } from '@/lib/helpers/invoice-calculations';
import { prepareInvoiceDataForPdf } from '@/lib/helpers/invoice-pdf-helpers';
import { WORDING } from './wording';
import type { InvoiceDocument, InvoiceDocumentParties, InvoiceDocumentSource } from './types';

export type { InvoiceDocument, InvoiceDocumentSource, InvoiceDocumentParties } from './types';

const present = (v: string | null | undefined): v is string => Boolean(v);

function partyLines(
  p: { name: string; legalName?: string | null; address: string | null; city: string | null; country: string | null; email: string | null; taxId: string | null } | null | undefined,
): string[] {
  if (!p) return [];
  const place = [p.city, p.country].filter(present).join(', ');
  const legal = p.legalName && p.legalName !== p.name ? p.legalName : null;
  return [p.name, legal, p.address, place, p.email, p.taxId ? `${WORDING.taxId} ${p.taxId}` : null].filter(present);
}

export function buildInvoiceDocument(source: InvoiceDocumentSource): InvoiceDocument {
  let form;
  let parties: InvoiceDocumentParties;
  const stored = source.kind === 'issued' ? source.invoice : null;
  if (source.kind === 'issued') {
    const data = prepareInvoiceDataForPdf(source.invoice);
    form = data.formData;
    parties = { senderProfile: data.senderProfile, customer: data.customer, bankAccount: data.bankAccount };
  } else {
    form = source.form;
    parties = source.parties;
  }

  const { currency } = form;
  const money = (value: number | string) => formatMoney(Number(value), currency);
  const day = (d: Date) => formatDay(dayToUtcDate(localDateToDay(d)));

  // An issued invoice prints the amounts stored when it was issued (what the list and the Customer
  // already have); only a draft is recomputed from its lines.
  const amounts = stored
    ? {
        items: stored.items.map((i) => ({ amount: i.amount })),
        subtotal: stored.subtotal,
        taxAmount: stored.taxAmount,
        total: stored.total,
      }
    : computeInvoiceAmounts({
        items: form.items.map((i) => ({ quantity: i.quantity, price: i.price })),
        discount: form.discount,
        shipping: form.shipping,
        taxRate: form.taxRate,
      });

  const meta = [
    { label: WORDING.date, value: day(form.issueDate) },
    { label: WORDING.due, value: day(form.dueDate) },
    ...(form.poNumber ? [{ label: WORDING.po, value: form.poNumber }] : []),
  ];

  const lines = form.items.map((item, index) => {
    const custom = item.productId === 'custom';
    return {
      name: item.productName || WORDING.untitled,
      description: item.description && !custom ? item.description : null,
      price: money(item.price),
      quantity: custom ? String(item.quantity) : `${item.quantity} ${item.unit}`,
      amount: money(amounts.items[index].amount),
    };
  });

  const summary = [
    { label: WORDING.subtotal, value: money(amounts.subtotal) },
    ...(form.discount > 0 ? [{ label: WORDING.discount, value: `-${money(form.discount)}` }] : []),
    ...(form.shipping > 0 ? [{ label: WORDING.shipping, value: `+${money(form.shipping)}` }] : []),
    ...(form.taxRate > 0
      ? [{ label: WORDING.tax(form.taxRate), value: money(decimalStringToNumber(String(amounts.taxAmount))) }]
      : []),
  ];

  const bank = parties.bankAccount;

  return {
    title: WORDING.title,
    invoiceNumber: form.invoiceNumber,
    meta,
    from: { title: WORDING.from, lines: partyLines(parties.senderProfile) },
    to: { title: WORDING.to, lines: partyLines(parties.customer) },
    columns: { ...WORDING.columns },
    lines,
    summary,
    total: { label: WORDING.total, value: money(amounts.total) },
    notes: form.notes ? { title: WORDING.notes, text: form.notes } : null,
    terms: form.terms ? { title: WORDING.terms, text: form.terms } : null,
    bank: bank
      ? {
          title: WORDING.bank,
          lines: [
            bank.bankName,
            bank.accountName,
            bank.accountNumber ? `${WORDING.accountNumber} ${bank.accountNumber}` : null,
            bank.iban ? `${WORDING.iban} ${bank.iban}` : null,
            bank.swift ? `${WORDING.swift} ${bank.swift}` : null,
          ].filter(present),
        }
      : null,
  };
}
