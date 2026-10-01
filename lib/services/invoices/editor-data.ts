import 'server-only';
import { prisma } from '@/prisma';
import { fail, ok, type ActionResult } from '@/types/result';
import type {
  InvoiceBankAccount,
  InvoiceCustomPrice,
  InvoiceCustomer,
  InvoiceEditorData,
  InvoiceProduct,
  InvoiceSenderProfile,
} from '@/types/invoice/types';
import type { ActingFreelancer } from '@/lib/services/_shared/acting-freelancer';
import { failed } from '@/lib/services/_shared/result-helpers';
import {
  bankAccountSelect,
  customPriceSelect,
  customerSelect,
  productSelect,
  senderProfileSelect,
} from '@/lib/services/invoices/select-queries';
import {
  computeInvoiceLegacyInfo,
  serializeDecimal,
  transformInvoiceToFormData,
} from '@/lib/services/invoices/helpers';

/** Everything the new/edit invoice editor needs (AC-25: includes the Customer's custom prices). */
export async function getInvoiceEditorData(
  actor: ActingFreelancer,
  invoiceId?: string,
): Promise<ActionResult<InvoiceEditorData>> {
  try {
    const userId = actor.userId;

    const [senderProfiles, customers, products, customPrices, existingInvoice] = await Promise.all([
      prisma.senderProfile.findMany({
        where: { userId },
        select: { ...senderProfileSelect, bankAccounts: { select: bankAccountSelect } },
        orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }, { id: 'asc' }],
      }),
      prisma.customer.findMany({ where: { userId }, select: customerSelect, orderBy: [{ name: 'asc' }, { id: 'asc' }] }),
      prisma.product.findMany({
        where: { userId, isActive: true },
        select: productSelect,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
      prisma.customPrice.findMany({ where: { product: { userId } }, select: customPriceSelect,
        orderBy: [{ product: { name: 'asc' } }, { id: 'asc' }],
      }),
      invoiceId
        ? prisma.invoice.findFirst({
            where: { id: invoiceId, senderProfile: { userId } },
            include: { items: true },
          })
        : null,
    ]);

    if (invoiceId && !existingInvoice) return fail('NOT_FOUND', 'Invoice not found.');

    const bankAccounts: InvoiceBankAccount[] = senderProfiles.flatMap((p) => p.bankAccounts);

    const transformedProducts: InvoiceProduct[] = products.map((p) => ({
      ...p,
      price: serializeDecimal(p.price),
    }));
    const transformedCustomPrices: InvoiceCustomPrice[] = customPrices.map((cp) => ({
      ...cp,
      price: serializeDecimal(cp.price),
    }));
    const transformedProfiles: InvoiceSenderProfile[] = senderProfiles.map(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      ({ bankAccounts: _bankAccounts, ...profile }) => profile,
    );

    const legacy = existingInvoice ? await computeInvoiceLegacyInfo(prisma, existingInvoice) : null;

    return ok({
      senderProfiles: transformedProfiles,
      bankAccounts,
      customers: customers as InvoiceCustomer[],
      products: transformedProducts,
      customPrices: transformedCustomPrices,
      initialData: existingInvoice ? transformInvoiceToFormData(existingInvoice) : undefined,
      invoiceId,
      legacy,
    });
  } catch (error) {
    return failed('Error fetching invoice editor data:', error, 'Failed to fetch invoice editor data.');
  }
}
