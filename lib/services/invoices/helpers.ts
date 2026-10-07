import 'server-only';
import { prisma } from '@/prisma';
import { SerializedInvoice, InvoiceFormData, InvoiceLegacyInfo } from '@/types/invoice/types';
import { Prisma } from '@prisma/client';
import type {
  Invoice,
  InvoiceItem,
  SenderProfile,
  Customer,
  BankAccount,
  Currency,
} from '@prisma/client';
import { ActionResult, ok, fail } from '@/types/result';
import { isInvoiceKeyTaken } from './numbering';

/**
 * The order an invoice's lines print and compare in (invoice-integrity T14): creation order. There
 * is no position column; the lines of one save share a createdAt (one transaction), and their cuid
 * ids sort in creation order. Without it Postgres may return them reordered after any row update.
 */
export const INVOICE_ITEM_ORDER = [{ createdAt: 'asc' }, { id: 'asc' }] satisfies Prisma.InvoiceItemOrderByWithRelationInput[];

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
  const sharedNumber = await isInvoiceKeyTaken(
    client,
    invoice.senderProfileId,
    invoice.invoiceNumberKey,
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

/** The draft currency rule's input (AC-11, AC-12): the invoice's currency and its lines. */
export interface InvoiceCurrencyCheck {
  currency: Currency;
  items: { productId?: string | null }[];
}

type RelationsClient = Pick<Prisma.TransactionClient, 'senderProfile' | 'customer' | 'bankAccount' | 'product'>;

/**
 * Ownership of the invoice's relations (another Freelancer's record is NOT_FOUND, like a missing
 * one) and, when `currencies` is given (invoice-integrity T06, AC-11, AC-12), the currency
 * invariant as fieldErrors: the bank account's currency, then every catalogue line product's,
 * inactive products included. Free-text lines (no product, or 'custom') are not checked. Pass the
 * transaction client to run it inside a save transaction.
 */
export async function verifyInvoiceRelations(
  userId: string,
  senderProfileId: string,
  customerId: string,
  bankAccountId: string,
  currencies?: InvoiceCurrencyCheck,
  db: RelationsClient = prisma
): Promise<
  ActionResult<{
    senderProfile: SenderProfile;
    customer: Customer;
    bankAccount: BankAccount;
    fieldErrors: Record<string, string[]>;
  }>
> {
  const [senderProfile, customer, bankAccount] = await Promise.all([
    db.senderProfile.findFirst({ where: { id: senderProfileId, userId } }),
    db.customer.findFirst({ where: { id: customerId, userId } }),
    // F-43: tied to the SPECIFIC sender profile the invoice is being saved under, not just to
    // any profile the same user owns — otherwise an invoice could carry senderProfileId A with
    // a bank account that actually belongs to the same user's profile B, which later makes
    // deleteSenderProfile's invoice count for B miss it entirely.
    db.bankAccount.findFirst({
      where: { id: bankAccountId, senderProfileId, senderProfile: { userId } },
    }),
  ]);

  if (!senderProfile) return fail('NOT_FOUND', 'Sender profile not found.');
  if (!customer) return fail('NOT_FOUND', 'Customer not found.');
  if (!bankAccount) return fail('NOT_FOUND', 'Bank account not found.');

  const fieldErrors: Record<string, string[]> = {};
  if (currencies) {
    const { currency, items } = currencies;
    if (bankAccount.currency !== currency) {
      fieldErrors.bankAccountId = [
        `This account is in ${bankAccount.currency} while the invoice is in ${currency}.`,
      ];
    }

    const productIds = Array.from(new Set(items.map((item) => item.productId).filter(isCatalogueProductId)));
    // By id and owner only: an inactive (retired) product is checked too.
    const products =
      productIds.length === 0
        ? []
        : await db.product.findMany({
            where: { id: { in: productIds }, userId },
            select: { id: true, name: true, currency: true },
          });
    if (products.length !== productIds.length) return fail('NOT_FOUND', 'Product not found.');

    const byId = new Map(products.map((product) => [product.id, product]));
    items.forEach((item, i) => {
      const product = isCatalogueProductId(item.productId) ? byId.get(item.productId) : undefined;
      if (product && product.currency !== currency) {
        fieldErrors[`items.${i}.productId`] = [
          `“${product.name}” is priced in ${product.currency} while the invoice is in ${currency}.`,
        ];
      }
    });
  }

  return ok({ senderProfile, customer, bankAccount, fieldErrors });
}

function isCatalogueProductId(id: string | null | undefined): id is string {
  return Boolean(id) && id !== 'custom';
}

/**
 * F-48: item.productId was stored with no ownership check at all, so a request could carry
 * another Freelancer's product id — which that product's real owner then couldn't have its
 * currency/unit changed or be deleted (the "used in N invoice(s)" conflict would count an
 * invoice that isn't theirs). Checked against every non-empty, non-'custom' productId at once.
 */
export async function verifyItemProductsOwnership(
  userId: string,
  items: { productId?: string }[]
): Promise<ActionResult<void>> {
  const productIds = Array.from(
    new Set(
      items
        .map((item) => item.productId)
        .filter((id): id is string => Boolean(id) && id !== 'custom')
    )
  );

  if (productIds.length === 0) return ok();

  const owned = await prisma.product.findMany({
    where: { id: { in: productIds }, userId },
    select: { id: true },
  });

  if (owned.length !== productIds.length) {
    return fail('NOT_FOUND', 'Product not found.');
  }

  return ok();
}
