// T16 (ai-assistant; ADR-0006): the one deterministic draft resolver shared by the chat and MCP. It
// composes the parties (T07) and the lines into a DraftProposal, or returns every DraftIssue together.
// Pure apart from reads: it creates nothing.
import 'server-only';
import { computeInvoiceAmounts } from '@/lib/helpers/invoice-calculations';
import { ok, type ActionResult } from '@/types/result';
import type { ActingFreelancer } from '@/lib/services/_shared/acting-freelancer';
import type { InvoiceFormInput } from '@/lib/validations/invoice';
import { resolveParties } from '@/lib/services/assistant-drafts/resolve-parties';
import { resolveLines } from '@/lib/services/assistant-drafts/resolve-lines';
import type { DraftIssue, DraftProposal, DraftRequest } from '@/lib/services/assistant-drafts/schema';

export type DraftResolution =
  | { kind: 'PROPOSAL'; proposal: DraftProposal }
  | { kind: 'ISSUES'; issues: DraftIssue[] };

export async function resolveDraftRequest(
  actor: ActingFreelancer,
  request: DraftRequest,
  today: string,
): Promise<ActionResult<DraftResolution>> {
  const parties = await resolveParties(actor, request, today);
  const resolved = await resolveLines(request, {
    userId: actor.userId,
    currency: parties.ok ? parties.parties.currency : undefined,
    customerId: parties.ok ? parties.parties.customer.customerId : undefined,
  });

  const issues = [...(parties.ok ? [] : parties.issues), ...resolved.issues];
  if (!parties.ok || issues.length > 0) return ok({ kind: 'ISSUES', issues });

  const amounts = computeInvoiceAmounts({
    items: resolved.lines.map((l) => ({ quantity: l.quantity, price: l.rate })),
    discount: 0,
    shipping: 0,
    taxRate: 0,
  });
  const lines = resolved.lines.map((l, i) => ({ ...l, amount: amounts.items[i].amount }));

  const defaultsUsed: string[] = [];
  const { senderProfile, bankAccount, issueDate, dueDate } = parties.parties;
  if (senderProfile.source === 'DEFAULT') defaultsUsed.push('senderProfile');
  if (bankAccount.source === 'DEFAULT') defaultsUsed.push('bankAccount');
  if (issueDate.source === 'DEFAULT') defaultsUsed.push('issueDate');
  if (dueDate.source === 'DEFAULT') defaultsUsed.push('dueDate');
  lines.forEach((l, i) => {
    if (l.quantitySource === 'DEFAULT') defaultsUsed.push(`lines[${i}].quantity`);
    if (l.unitSource === 'DEFAULT') defaultsUsed.push(`lines[${i}].unit`);
  });

  return ok({
    kind: 'PROPOSAL',
    proposal: {
      ...parties.parties,
      lines,
      subtotal: amounts.subtotal,
      total: amounts.subtotal,
      invoiceNumber: null,
      defaultsUsed,
    },
  });
}

/** The editor input of a proposal: no tax, discount or shipping, number left to the system (origin is a
 * separate service argument, sad.md §11). */
export function toInvoiceFormInput(proposal: DraftProposal, notes = ''): InvoiceFormInput {
  return {
    invoiceNumber: '',
    status: 'DRAFT',
    senderProfileId: proposal.senderProfile.senderProfileId,
    bankAccountId: proposal.bankAccount.bankAccountId,
    customerId: proposal.customer.customerId,
    issueDate: proposal.issueDate.value,
    dueDate: proposal.dueDate.value,
    currency: proposal.currency,
    items: proposal.lines.map((l, i) => ({
      id: String(i),
      ...(l.productId ? { productId: l.productId } : {}),
      productName: l.name,
      description: '',
      unit: l.unit,
      quantity: Number(l.quantity),
      price: Number(l.rate),
      total: Number(l.amount),
    })),
    taxRate: 0,
    discount: 0,
    shipping: 0,
    notes,
  };
}
