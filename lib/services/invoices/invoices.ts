import 'server-only';
import { prisma } from '@/prisma';
import { fail, ok, type ActionResult } from '@/types/result';
import type { SerializedInvoice } from '@/types/invoice/types';
import type { ActingFreelancer } from '@/lib/services/_shared/acting-freelancer';
import { failed } from '@/lib/services/_shared/result-helpers';
import { computeInvoiceLegacyInfo, serializeInvoice } from '@/lib/actions/invoice-actions/helpers';
import { peekNextInvoiceNumber as peekNextNumber } from './numbering';

const PROFILE_NOT_FOUND = 'Sender profile not found.';

export async function getInvoice(actor: ActingFreelancer, id: string): Promise<ActionResult<SerializedInvoice>> {
  try {
    const invoice = await prisma.invoice.findFirst({
      where: { id, senderProfile: { userId: actor.userId } },
      include: { items: true, senderProfile: true, customer: true, bankAccount: true },
    });
    if (!invoice) return fail('NOT_FOUND', 'Invoice not found.');

    const serialized = serializeInvoice(invoice);
    if (!serialized) {
      return failed(
        'Invoice serialize failed:',
        new Error(`Invoice ${id} could not be serialized`),
        'Failed to serialize invoice.',
      );
    }

    // AC-17's legacy flags (contracts/server-actions.md §getInvoiceEditorData / getInvoice).
    const legacy = await computeInvoiceLegacyInfo(prisma, invoice);
    return ok({ ...serialized, legacy });
  } catch (error) {
    return failed('Error fetching invoice:', error, 'Failed to fetch invoice.');
  }
}

/** The next proposed invoice number as a hint only (AC-06): no lock, no side effect. */
export async function peekNextInvoiceNumber(
  actor: ActingFreelancer,
  senderProfileId: string,
): Promise<ActionResult<string>> {
  try {
    const profile = await prisma.senderProfile.findFirst({
      where: { id: senderProfileId, userId: actor.userId },
      select: { id: true },
    });
    if (!profile) return fail('NOT_FOUND', PROFILE_NOT_FOUND);

    const invoiceNumber = await peekNextNumber(senderProfileId);
    if (invoiceNumber === null) return fail('NOT_FOUND', PROFILE_NOT_FOUND);
    return ok(invoiceNumber);
  } catch (error) {
    return failed('Error generating invoice number:', error, 'Failed to generate invoice number.');
  }
}
