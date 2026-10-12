// T20 (ai-assistant; spec.md §5 AC-11c, AC-13, AC-14, AC-14b, AC-18; ADR-0007): Draft cards keep one LIVE card
// per Conversation, and the Create press is the only way a chat draft comes into existence. It never
// touches the Daily message allowance and never calls the model.
import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/prisma';
import { fail, ok, type ActionResult } from '@/types/result';
import type { ActingFreelancer } from '@/lib/services/_shared/acting-freelancer';
import { failed } from '@/lib/services/_shared/result-helpers';
import { todayInZone } from '@/lib/helpers/calendar-day';
import { createInvoice } from '@/lib/services/invoices/invoices';
import { readInvoiceStates } from '@/lib/services/conversations/conversations';
import { toDraftCardView } from '@/lib/services/assistant-drafts/card-view';
import { fingerprintRequest } from '@/lib/services/assistant-drafts/fingerprint';
import { resolveDraftRequest, toInvoiceFormInput } from '@/lib/services/assistant-drafts/resolve';
import {
  draftProposalSchema,
  draftRequestSchema,
  type DraftIssue,
} from '@/lib/services/assistant-drafts/schema';
import type { DraftCardView, LinkedInvoiceState } from '@/types/assistant/types';

const NOT_FOUND_MESSAGE = 'This draft card is no longer available.';
const FAILED_MESSAGE = "The draft couldn't be created. Try again.";

export type CreateFromCardResult =
  | { kind: 'CREATED'; invoiceId: string; invoiceNumber: string }
  | { kind: 'ALREADY_CREATED'; invoice: LinkedInvoiceState }
  | { kind: 'REPLACED'; newerCardId: string }
  | { kind: 'OUTDATED'; card: DraftCardView }
  | { kind: 'NEEDS_ANSWERS'; issues: DraftIssue[] };

/**
 * Stores a new LIVE card as the Conversation's only one. The order matters: the previous LIVE card
 * leaves LIVE first (the partial unique index), then the new one is inserted, then the old points to it.
 */
export async function insertLiveCard(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    conversationId: string;
    id?: string;
    request: unknown;
    proposal: unknown;
    /** The state the previous LIVE card takes: REPLACED by a new proposal, OUTDATED by a Create press. */
    previousState?: 'REPLACED' | 'OUTDATED';
  }
): Promise<{ id: string }> {
  const previous = await tx.draftCard.findMany({
    where: { conversationId: input.conversationId, state: 'LIVE' },
    select: { id: true },
  });
  const previousIds = previous.map((c) => c.id);
  if (previousIds.length > 0) {
    await tx.draftCard.updateMany({
      where: { id: { in: previousIds } },
      data: { state: input.previousState ?? 'REPLACED' },
    });
  }
  const created = await tx.draftCard.create({
    data: {
      ...(input.id ? { id: input.id } : {}),
      userId: input.userId,
      conversationId: input.conversationId,
      state: 'LIVE',
      request: input.request as Prisma.InputJsonValue,
      proposal: input.proposal as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
  if (previousIds.length > 0) {
    await tx.draftCard.updateMany({
      where: { id: { in: previousIds } },
      data: { replacedById: created.id },
    });
  }
  return { id: created.id };
}

/** The content a Freelancer confirmed: everything but the number, which the system assigns on create. */
function contentKey(proposal: unknown): string {
  const parsed = draftProposalSchema.parse(proposal);
  return fingerprintRequest({ ...parsed, invoiceNumber: undefined });
}

type Outcome =
  | { done: ActionResult<CreateFromCardResult> }
  | { alreadyCreatedInvoiceId: string | null };

export async function createFromCard(
  actor: ActingFreelancer,
  cardId: string,
  now: Date
): Promise<ActionResult<CreateFromCardResult>> {
  try {
    const outcome = await prisma.$transaction(async (tx): Promise<Outcome> => {
      const [locked] = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "DraftCard"
        WHERE "id" = ${cardId} AND "userId" = ${actor.userId} FOR UPDATE`;
      if (!locked) return { done: fail('NOT_FOUND', NOT_FOUND_MESSAGE) };
      const card = await tx.draftCard.findUniqueOrThrow({ where: { id: cardId } });

      if (card.state === 'CREATED') return { alreadyCreatedInvoiceId: card.invoiceId };
      if (card.state === 'REPLACED' || card.state === 'OUTDATED') {
        return card.replacedById
          ? { done: ok({ kind: 'REPLACED', newerCardId: card.replacedById }) }
          : { done: fail('NOT_FOUND', NOT_FOUND_MESSAGE) };
      }

      const request = draftRequestSchema.parse(card.request);
      const resolved = await resolveDraftRequest(actor, request, todayInZone(actor.timeZone, now));
      if (!resolved.success) throw new Error('resolveDraftRequest failed');

      if (resolved.data.kind === 'ISSUES') {
        await tx.draftCard.update({ where: { id: card.id }, data: { state: 'OUTDATED' } });
        return { done: ok({ kind: 'NEEDS_ANSWERS', issues: resolved.data.issues }) };
      }

      const { proposal } = resolved.data;
      if (contentKey(proposal) !== contentKey(card.proposal)) {
        const next = await insertLiveCard(tx, {
          userId: actor.userId,
          conversationId: card.conversationId,
          request: card.request,
          proposal,
          previousState: 'OUTDATED',
        });
        return {
          done: ok({
            kind: 'OUTDATED',
            card: toDraftCardView(
              { id: next.id, state: 'LIVE', proposal, replacedById: null, invoiceId: null },
              {}
            ),
          }),
        };
      }

      const created = await createInvoice(actor, toInvoiceFormInput(proposal), { origin: 'CHAT' }, tx);
      if (!created.success) throw new Error(`createInvoice refused: ${created.code}`);
      await tx.draftCard.update({
        where: { id: card.id },
        data: { state: 'CREATED', invoiceId: created.data.id },
      });
      return {
        done: ok({
          kind: 'CREATED',
          invoiceId: created.data.id,
          invoiceNumber: created.data.invoiceNumber,
        }),
      };
    });

    if ('done' in outcome) return outcome.done;
    const id = outcome.alreadyCreatedInvoiceId;
    const states = id ? await readInvoiceStates(actor, [id]) : {};
    return ok({
      kind: 'ALREADY_CREATED',
      invoice: (id && states[id]) || { state: 'UNAVAILABLE' },
    });
  } catch (error) {
    return failed('Error creating the draft from a card:', error, FAILED_MESSAGE, 'assistant.create-from-card');
  }
}
