import { InvoiceFormValues } from '@/lib/validations/invoice';
import { prisma } from '@/prisma';
import { SerializedInvoice, InvoiceFormData } from '@/types/invoice/types';
import { Prisma } from '@prisma/client';
import type {
  Invoice,
  InvoiceItem,
  SenderProfile,
  Customer,
  BankAccount,
} from '@prisma/client';
import { ActionResult } from '@/types/actions';

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

export { calculateInvoiceTotals } from '@/lib/helpers/invoice-calculations';

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

export function buildInvoiceItems(items: InvoiceFormValues['items']) {
  return items.map((item) => ({
    productId:
      item.productId && item.productId !== 'custom' ? item.productId : null,
    name: item.productName,
    description: item.description || null,
    unit: item.unit,
    quantity: item.quantity,
    rate: item.price,
    amount: item.total,
  }));
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

  if (!senderProfile)
    return { success: false, error: 'Sender profile not found' };
  if (!customer) return { success: false, error: 'Customer not found' };
  if (!bankAccount) return { success: false, error: 'Bank account not found' };

  return { success: true, data: { senderProfile, customer, bankAccount } };
}
