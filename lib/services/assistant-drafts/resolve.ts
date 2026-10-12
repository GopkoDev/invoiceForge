// T16 (ai-assistant; ADR-0006): the one deterministic draft resolver shared by the chat and MCP. It
// composes the parties (T07) and the lines into a DraftProposal, or returns every DraftIssue together.
// Pure apart from reads: it creates nothing.
import 'server-only';
import { computeInvoiceAmounts, lineAmount } from '@/lib/helpers/invoice-calculations';
import { ok, type ActionResult } from '@/types/result';
import type { ActingFreelancer } from '@/lib/services/_shared/acting-freelancer';
import {
  checkDraftAmountRules,
  checkDueDate,
  invoiceShapeSchema,
  type FieldErrors,
  type InvoiceFormInput,
} from '@/lib/validations/invoice';
import { resolveParties } from '@/lib/services/assistant-drafts/resolve-parties';
import { resolveLines } from '@/lib/services/assistant-drafts/resolve-lines';
import type { DraftIssue, DraftProposal, DraftRequest } from '@/lib/services/assistant-drafts/schema';

export type DraftResolution =
  | { kind: 'PROPOSAL'; proposal: DraftProposal }
  | { kind: 'ISSUES'; issues: DraftIssue[] };

const asRequested = (value: string | undefined): { value: string; source: 'REQUEST' } | undefined =>
  value === undefined ? undefined : { value, source: 'REQUEST' };
const asDecimal = (value: string | undefined) => (value === undefined ? undefined : lineAmount(value, '1'));

/**
 * review-2026-10-12 R-08: what the editor would refuse (quantity not above zero, an amount over the cap,
 * tax over 100 %, the discount cap, due before issue) is a FIELD_INVALID issue, checked with the invoice
 * domain's own rules - the very ones createInvoice runs - so a card never reaches a refused create.
 */
function invoiceRuleIssues(proposal: DraftProposal): DraftIssue[] {
  const errors: FieldErrors = {};
  const shape = invoiceShapeSchema.safeParse(toInvoiceFormInput(proposal));
  if (!shape.success) {
    for (const issue of shape.error.issues) {
      const field = issue.path.join('.');
      errors[field] = [...(errors[field] ?? []), issue.message];
    }
  } else {
    Object.assign(errors, checkDraftAmountRules(shape.data), checkDueDate(shape.data.issueDate, shape.data.dueDate));
  }
  return Object.entries(errors).map(([field, messages]) => ({ kind: 'FIELD_INVALID', field, message: messages[0] }));
}

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

  // spec.md §1 "What a request may set" (R-09): each is REQUEST when given, else the editor's default.
  const taxRate = asDecimal(request.taxRate);
  const discount = asDecimal(request.discount);
  const shipping = asDecimal(request.shipping);
  const amounts = computeInvoiceAmounts({
    items: resolved.lines.map((l) => ({ quantity: l.quantity, price: l.rate })),
    discount: discount ?? 0,
    shipping: shipping ?? 0,
    taxRate: taxRate ?? 0,
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

  const proposal: DraftProposal = {
    ...parties.parties,
    lines,
    subtotal: amounts.subtotal,
    total: amounts.total,
    taxRate: asRequested(taxRate),
    taxAmount: taxRate === undefined ? undefined : amounts.taxAmount,
    discount: asRequested(discount),
    shipping: asRequested(shipping),
    poNumber: asRequested(request.poNumber),
    paymentTerms: asRequested(request.paymentTerms),
    notes: asRequested(request.notes),
    terms: asRequested(request.terms),
    invoiceNumber: null,
    defaultsUsed,
  };

  const ruleIssues = invoiceRuleIssues(proposal);
  if (ruleIssues.length > 0) return ok({ kind: 'ISSUES', issues: ruleIssues });
  return ok({ kind: 'PROPOSAL', proposal });
}

/** The editor input of a proposal: the number left to the system (origin is a separate service argument,
 * sad.md §11); tax, discount, shipping and the texts as the request set them, else the editor's defaults. */
export function toInvoiceFormInput(proposal: DraftProposal): InvoiceFormInput {
  return {
    invoiceNumber: '',
    status: 'DRAFT',
    senderProfileId: proposal.senderProfile.senderProfileId,
    bankAccountId: proposal.bankAccount.bankAccountId,
    customerId: proposal.customer.customerId,
    issueDate: proposal.issueDate.value,
    dueDate: proposal.dueDate.value,
    currency: proposal.currency,
    poNumber: proposal.poNumber?.value ?? '',
    paymentTerms: proposal.paymentTerms?.value ?? '',
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
    taxRate: Number(proposal.taxRate?.value ?? 0),
    discount: Number(proposal.discount?.value ?? 0),
    shipping: Number(proposal.shipping?.value ?? 0),
    notes: proposal.notes?.value ?? '',
    terms: proposal.terms?.value ?? '',
  };
}
