// T21 (ai-assistant; spec.md §5 AC-17, AC-27, AC-29..AC-32; ADR-0012): an Assistant with a Draft-permission
// Personal key creates a Draft invoice. Order: permission, repeat mark, resolver, then one transaction
// (key slot, invoice, repeat row). The Assistant never issues, sends, edits or deletes.
import 'server-only';
import { prisma } from '@/prisma';
import { fail, ok, type ActionResult } from '@/types/result';
import type { ActingFreelancer } from '@/lib/services/_shared/acting-freelancer';
import { failed, isUniqueConstraintError } from '@/lib/services/_shared/result-helpers';
import { todayInZone } from '@/lib/helpers/calendar-day';
import { createInvoice } from '@/lib/services/invoices/invoices';
import { takeKeyDraftSlot } from '@/lib/services/assistant-usage/key-drafts';
import { fingerprintRequest } from '@/lib/services/assistant-drafts/fingerprint';
import { resolveDraftRequest, toInvoiceFormInput } from '@/lib/services/assistant-drafts/resolve';
import { readRepeatMark, writeRepeatMark } from '@/lib/services/assistant-drafts/repeat-marks';
import type { CreateDraftInvoiceInput, DraftProposal } from '@/lib/services/assistant-drafts/schema';

export type DraftCreatedAnswer = {
  invoiceId: string;
  invoiceNumber: string;
  status: 'DRAFT';
  link: string;
  draft: DraftProposal;
  repeated: boolean;
};

type Key = { id: string; name: string; canCreateDrafts: boolean };

const FAILED_MESSAGE = "The draft couldn't be created. Try again.";
const GONE_MESSAGE = 'The draft created by the first request has been deleted since.';
const CHANGED_MESSAGE = 'This repeat key was already used with different content. Nothing was created.';

class Refusal extends Error {
  constructor(readonly result: ActionResult<never>) {
    super('refused');
  }
}

const linkTo = (invoiceId: string) =>
  `${process.env.AUTH_URL ?? 'http://localhost:3000'}/invoices/${invoiceId}/edit`;

export async function createDraftForKey(
  actor: ActingFreelancer,
  key: Key,
  input: CreateDraftInvoiceInput,
  now: Date
): Promise<ActionResult<DraftCreatedAnswer>> {
  if (!key.canCreateDrafts) {
    return fail('FORBIDDEN', 'This key can only read. Create a key with Draft permission to draft invoices.');
  }
  try {
    const { repeatKey, ...request } = input;
    const today = todayInZone(actor.timeZone, now);
    const fingerprint = fingerprintRequest(request);

    const answerForMark = async (): Promise<ActionResult<DraftCreatedAnswer> | null> => {
      if (repeatKey === undefined) return null;
      const mark = await readRepeatMark(key.id, repeatKey, now);
      if (!mark) return null;
      if (mark.fingerprint !== fingerprint) return fail('CONFLICT', CHANGED_MESSAGE);
      const invoice = mark.invoiceId
        ? await prisma.invoice.findFirst({
            where: { id: mark.invoiceId, customer: { userId: actor.userId } },
            select: { id: true, invoiceNumber: true },
          })
        : null;
      if (!invoice) return fail('NOT_FOUND', GONE_MESSAGE);
      const resolved = await resolveDraftRequest(actor, request, today);
      if (!resolved.success) return resolved;
      if (resolved.data.kind === 'ISSUES') return fail('CONFLICT', CHANGED_MESSAGE);
      return ok({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        status: 'DRAFT',
        link: linkTo(invoice.id),
        draft: { ...resolved.data.proposal, invoiceNumber: invoice.invoiceNumber },
        repeated: true,
      });
    };

    const earlier = await answerForMark();
    if (earlier) return earlier;

    const resolved = await resolveDraftRequest(actor, request, today);
    if (!resolved.success) return resolved;
    if (resolved.data.kind === 'ISSUES') {
      return fail('VALIDATION', 'The request is ambiguous or incomplete. Nothing was created.', {
        details: { kind: 'DRAFT_ISSUES', issues: resolved.data.issues },
      });
    }
    const { proposal } = resolved.data;

    try {
      return await prisma.$transaction(async (tx) => {
        const slot = await takeKeyDraftSlot(tx, key, actor.timeZone, now);
        if (!slot.ok) {
          throw new Refusal(
            fail('RATE_LIMITED', "This key's daily draft limit is reached. Lift it on the keys page.", {
              details: slot.details,
            })
          );
        }
        const created = await createInvoice(
          actor,
          toInvoiceFormInput(proposal),
          { origin: 'PERSONAL_KEY', keyId: key.id, keyName: key.name },
          tx
        );
        if (!created.success) throw new Error(`createInvoice refused: ${created.code}`);
        if (repeatKey !== undefined) {
          await writeRepeatMark(
            tx,
            { keyId: key.id, repeatKey, fingerprint, invoiceId: created.data.id },
            now
          );
        }
        return ok<DraftCreatedAnswer>({
          invoiceId: created.data.id,
          invoiceNumber: created.data.invoiceNumber,
          status: 'DRAFT',
          link: linkTo(created.data.id),
          draft: { ...proposal, invoiceNumber: created.data.invoiceNumber },
          repeated: false,
        });
      });
    } catch (error) {
      if (error instanceof Refusal) return error.result as ActionResult<DraftCreatedAnswer>;
      // A racing repeat won the mark: this transaction rolled back, so answer with the winner's draft.
      if (repeatKey !== undefined && isUniqueConstraintError(error)) {
        const winner = await answerForMark();
        if (winner) return winner;
      }
      throw error;
    }
  } catch (error) {
    return failed('Error creating a draft for a key:', error, FAILED_MESSAGE, 'assistant.create-for-key');
  }
}
