import { prisma } from '@/prisma';
import { SerializedInvoice, InvoiceFormData, InvoiceLegacyInfo } from '@/types/invoice/types';
import { Prisma } from '@prisma/client';
import type {
  Invoice,
  InvoiceItem,
  SenderProfile,
  Customer,
  BankAccount,
} from '@prisma/client';
import { ActionResult, ok, fail } from '@/types/actions';
import { isInvoiceKeyTaken, normalizeInvoiceNumber } from './numbering';

export function serializeDecimal<T extends number>(
  value: Prisma.Decimal | number
): T {
  return Number(value) as T;
}

export function serializeInvoice(
  invoice: (Invoice & { items: InvoiceItem[] }) | null
): SerializedInvoice | null {
  if (!invoice) return null;

  const { items, ...data } = invoice;
  return {
    ...data,
    subtotal: serializeDecimal(data.subtotal),
    taxRate: serializeDecimal(data.taxRate),
    taxAmount: serializeDecimal(data.taxAmount),
    discount: serializeDecimal(data.discount),
    shipping: serializeDecimal(data.shipping),
    total: serializeDecimal(data.total),
    amountPaid: serializeDecimal(data.amountPaid),
    items: items.map((item) => ({
      ...item,
      quantity: serializeDecimal(item.quantity),
      rate: serializeDecimal(item.rate),
      amount: serializeDecimal(item.amount),
    })),
  } as unknown as SerializedInvoice;
}

import { computeInvoiceAmounts } from '@/lib/helpers/invoice-calculations';

/**
 * T14 (spec.md §5 AC-17) — the legacy flags shared by getInvoiceEditorData/getInvoice and
 * updateInvoice's own legacy gates (contracts/server-actions.md §getInvoiceEditorData / getInvoice,
 * verbatim): recomputes the stored lines through the one exact-decimal module (ADR-0006) and
 * compares against the stored total; a shared/NULL normalized key also counts as legacy. `null`
 * when nothing differs and the number is free.
 */
export async function computeInvoiceLegacyInfo(
  client: Prisma.TransactionClient,
  invoice: Invoice & { items: InvoiceItem[] }
): Promise<InvoiceLegacyInfo | null> {
  const recomputed = computeInvoiceAmounts({
    items: invoice.items.map((item) => ({
      quantity: item.quantity.toString(),
      price: item.rate.toString(),
    })),
    discount: invoice.discount.toString(),
    shipping: invoice.shipping.toString(),
    taxRate: invoice.taxRate.toString(),
  });

  const storedTotal = invoice.total.toFixed(2);
  const recomputedTotal = recomputed.total;
  // F-09: a NULL key is checked by its own invoiceNumber's normalized key, not blanket-treated as
  // shared — a legacy invoice whose number turns out to be unique is no longer flagged shared.
  const effectiveKey = invoice.invoiceNumberKey ?? normalizeInvoiceNumber(invoice.invoiceNumber);
  const sharedNumber = await isInvoiceKeyTaken(
    client,
    invoice.senderProfileId,
    effectiveKey,
    invoice.id
  );

  if (storedTotal === recomputedTotal && !sharedNumber) {
    return null;
  }

  return { storedTotal, recomputedTotal, sharedNumber };
}

export function buildSenderSnapshot(profile: SenderProfile) {
  return {
    senderName: profile.name,
    senderLegalName: profile.legalName,
    senderTaxId: profile.taxId,
    senderAddress: profile.address,
    senderCity: profile.city,
    senderCountry: profile.country,
    senderPostalCode: profile.postalCode,
    senderPhone: profile.phone,
    senderEmail: profile.email,
    senderWebsite: profile.website,
    senderLogo: profile.logo,
  };
}

export function buildCustomerSnapshot(customer: Customer) {
  return {
    customerName: customer.name,
    customerCompanyName: customer.companyName,
    customerTaxId: customer.taxId,
    customerEmail: customer.email,
    customerPhone: customer.phone,
    customerAddress: customer.address,
    customerCity: customer.city,
    customerCountry: customer.country,
    customerPostalCode: customer.postalCode,
  };
}

export function buildBankAccountSnapshot(bankAccount: BankAccount) {
  return {
    bankName: bankAccount.bankName,
    bankAccountNumber: bankAccount.accountNumber,
    bankIban: bankAccount.iban,
    bankSwift: bankAccount.swift,
    accountName: bankAccount.accountName,
  };
}

export function transformInvoiceToFormData(
  invoice: Invoice & { items: InvoiceItem[] }
): InvoiceFormData {
  return {
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status,
    senderProfileId: invoice.senderProfileId,
    bankAccountId: invoice.bankAccountId,
    customerId: invoice.customerId,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    currency: invoice.currency,
    poNumber: invoice.poNumber || '',
    paymentTerms: invoice.paymentTerms || '',
    taxRate: serializeDecimal(invoice.taxRate),
    discount: serializeDecimal(invoice.discount),
    shipping: serializeDecimal(invoice.shipping),
    notes: invoice.notes || '',
    terms: invoice.terms || '',
    items: invoice.items.map((item) => ({
      id: item.id,
      productId: item.productId || '',
      productName: item.name,
      description: item.description || '',
      unit: item.unit,
      quantity: serializeDecimal(item.quantity),
      price: serializeDecimal(item.rate),
      total: serializeDecimal(item.amount),
    })),
  };
}

export async function verifyInvoiceRelations(
  userId: string,
  senderProfileId: string,
  customerId: string,
  bankAccountId: string
): Promise<
  ActionResult<{
    senderProfile: SenderProfile;
    customer: Customer;
    bankAccount: BankAccount;
  }>
> {
  const [senderProfile, customer, bankAccount] = await Promise.all([
    prisma.senderProfile.findFirst({ where: { id: senderProfileId, userId } }),
    prisma.customer.findFirst({ where: { id: customerId, userId } }),
    prisma.bankAccount.findFirst({
      where: { id: bankAccountId, senderProfile: { userId } },
    }),
  ]);

  if (!senderProfile) return fail('NOT_FOUND', 'Sender profile not found.');
  if (!customer) return fail('NOT_FOUND', 'Customer not found.');
  if (!bankAccount) return fail('NOT_FOUND', 'Bank account not found.');

  return ok({ senderProfile, customer, bankAccount });
}
