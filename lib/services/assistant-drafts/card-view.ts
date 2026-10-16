// T10 (ai-assistant; spec.md §5 AC-36): the DraftCardView of a stored card. A CREATED card carries the
// current state of its invoice, read when rendered and never stored; any other state carries none.
import 'server-only';
import { draftProposalSchema } from '@/lib/services/assistant-drafts/schema';
import type { InvoiceStatus } from '@prisma/client';
import { derivedStatus, type LocalDate } from '@/lib/services/_shared/overdue';
import type { DraftCardView, LinkedInvoiceState } from '@/types/assistant/types';

export type DraftCardRow = {
  id: string;
  state: DraftCardView['state'];
  proposal: unknown;
  replacedById: string | null;
  invoiceId: string | null;
};

const UNAVAILABLE: LinkedInvoiceState = { state: 'UNAVAILABLE' };

/** An existing invoice's current state as a card or link shows it (status derived for overdue). */
export function linkedInvoiceStateOf(
  row: { id: string; invoiceNumber: string; status: InvoiceStatus; dueDate: Date },
  today: LocalDate
): LinkedInvoiceState {
  return row.status === 'DRAFT'
    ? { state: 'DRAFT', invoiceId: row.id, invoiceNumber: row.invoiceNumber }
    : { state: 'ISSUED', invoiceId: row.id, invoiceNumber: row.invoiceNumber, status: derivedStatus(row, today) };
}

/** Throws a ZodError when the stored proposal is malformed; callers turn that into FAILED. */
export function toDraftCardView(
  card: DraftCardRow,
  invoiceStates: Record<string, LinkedInvoiceState>
): DraftCardView {
  let invoice: LinkedInvoiceState | null = null;
  if (card.state === 'CREATED') {
    invoice = (card.invoiceId !== null && invoiceStates[card.invoiceId]) || UNAVAILABLE;
  }
  return {
    id: card.id,
    state: card.state,
    proposal: draftProposalSchema.parse(card.proposal),
    replacedById: card.replacedById,
    invoice,
  };
}
