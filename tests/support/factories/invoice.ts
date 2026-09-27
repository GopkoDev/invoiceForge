import type {
  BankAccount,
  Currency,
  Customer,
  Invoice,
  InvoiceItem,
  InvoiceStatus,
  PrismaClient,
  SenderProfile,
} from '@prisma/client';

export interface InvoiceItemInput {
  productId?: string | null;
  name: string;
  description?: string | null;
  unit?: string;
  quantity: number;
  rate: number;
  amount: number;
  currency?: Currency | null;
}

type DecimalField =
  | 'subtotal'
  | 'taxRate'
  | 'taxAmount'
  | 'discount'
  | 'shipping'
  | 'total'
  | 'amountPaid';

export type InvoiceOverrides = Partial<
  Omit<
    Invoice,
    'id' | 'senderProfileId' | 'customerId' | 'bankAccountId' | 'createdAt' | 'updatedAt' | DecimalField
  >
> & { id?: string } & Partial<Record<DecimalField, number>>;

export interface CreateInvoiceParams {
  senderProfile: SenderProfile;
  customer: Customer;
  bankAccount: BankAccount;
  items?: InvoiceItemInput[];
  overrides?: InvoiceOverrides;
}

/** Builds an invoice + items, snapshotting sender/customer/bank fields the way the app does. */
export async function createInvoice(
  prisma: PrismaClient,
  params: CreateInvoiceParams
): Promise<Invoice & { items: InvoiceItem[] }> {
  const { senderProfile, customer, bankAccount } = params;
  const overrides = params.overrides ?? {};
  const items = params.items ?? [
    { name: 'Test Item', quantity: 1, rate: 100, amount: 100 },
  ];
  const subtotal = items.reduce((sum, item) => sum + item.amount, 0);

  return prisma.invoice.create({
    data: {
      senderProfileId: senderProfile.id,
      customerId: customer.id,
      bankAccountId: bankAccount.id,

      invoiceNumber: overrides.invoiceNumber ?? `${senderProfile.invoicePrefix}-0001`,
      invoiceNumberKey: overrides.invoiceNumberKey,
      issueDate: overrides.issueDate ?? new Date(),
      dueDate: overrides.dueDate ?? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      paymentTerms: overrides.paymentTerms,
      status: (overrides.status ?? 'DRAFT') as InvoiceStatus,

      senderName: overrides.senderName ?? senderProfile.name,
      senderLegalName: overrides.senderLegalName ?? senderProfile.legalName,
      senderTaxId: overrides.senderTaxId ?? senderProfile.taxId,
      senderAddress: overrides.senderAddress ?? senderProfile.address,
      senderCity: overrides.senderCity ?? senderProfile.city,
      senderCountry: overrides.senderCountry ?? senderProfile.country,
      senderPostalCode: overrides.senderPostalCode ?? senderProfile.postalCode,
      senderPhone: overrides.senderPhone ?? senderProfile.phone,
      senderEmail: overrides.senderEmail ?? senderProfile.email,
      senderWebsite: overrides.senderWebsite ?? senderProfile.website,
      senderLogo: overrides.senderLogo ?? senderProfile.logo,

      customerName: overrides.customerName ?? customer.name,
      customerCompanyName: overrides.customerCompanyName ?? customer.companyName,
      customerTaxId: overrides.customerTaxId ?? customer.taxId,
      customerEmail: overrides.customerEmail ?? customer.email,
      customerPhone: overrides.customerPhone ?? customer.phone,
      customerAddress: overrides.customerAddress ?? customer.address,
      customerCity: overrides.customerCity ?? customer.city,
      customerCountry: overrides.customerCountry ?? customer.country,
      customerPostalCode: overrides.customerPostalCode ?? customer.postalCode,

      bankName: overrides.bankName ?? bankAccount.bankName,
      bankAccountNumber: overrides.bankAccountNumber ?? bankAccount.accountNumber,
      bankIban: overrides.bankIban ?? bankAccount.iban,
      bankSwift: overrides.bankSwift ?? bankAccount.swift,
      accountName: overrides.accountName ?? bankAccount.accountName,

      subtotal: overrides.subtotal ?? subtotal,
      taxRate: overrides.taxRate ?? 0,
      taxAmount: overrides.taxAmount ?? 0,
      discount: overrides.discount ?? 0,
      shipping: overrides.shipping ?? 0,
      total: overrides.total ?? subtotal,
      amountPaid: overrides.amountPaid ?? 0,

      currency: (overrides.currency ?? bankAccount.currency) as Currency,

      notes: overrides.notes,
      terms: overrides.terms,
      poNumber: overrides.poNumber,
      paidAt: overrides.paidAt,

      ...(overrides.id ? { id: overrides.id } : {}),

      items: {
        create: items.map((item) => ({
          productId: item.productId,
          name: item.name,
          description: item.description,
          unit: item.unit ?? 'pcs',
          quantity: item.quantity,
          rate: item.rate,
          amount: item.amount,
          currency: item.currency,
        })),
      },
    },
    include: { items: true },
  });
}

/**
 * A "legacy" invoice (test-plan.md §Test data): written before invoiceNumberKey existed, so its
 * key is NULL, and its stored total may not match a fresh recompute of its items (drift the
 * migration/read-repair tasks need to reproduce).
 */
export async function createLegacyInvoice(
  prisma: PrismaClient,
  params: CreateInvoiceParams & { storedTotal?: number }
): Promise<Invoice & { items: InvoiceItem[] }> {
  const items = params.items ?? [{ name: 'Legacy Item', quantity: 1, rate: 100, amount: 100 }];
  const recomputedTotal = items.reduce((sum, item) => sum + item.amount, 0);
  // A stored total that deliberately disagrees with a fresh recompute of the items.
  const storedTotal = params.storedTotal ?? recomputedTotal + 1;

  return createInvoice(prisma, {
    ...params,
    items,
    overrides: {
      ...params.overrides,
      subtotal: recomputedTotal,
      total: storedTotal,
      invoiceNumberKey: null,
    },
  });
}
