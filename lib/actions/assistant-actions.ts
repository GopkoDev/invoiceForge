'use server';

import { revalidatePath } from 'next/cache';
import { protectedRoutes } from '@/config/routes.config';
import { actingFreelancerFromSession } from '@/lib/helpers/session-actor';
import {
  createFromCard,
  getCardInvoicePreview,
  type CreateFromCardResult,
  type InvoicePreview,
} from '@/lib/services/assistant-drafts/cards';
import { issueInvoiceFromPreview } from '@/lib/services/invoices/invoices';
import { issueFromPreviewInputSchema } from '@/lib/validations/assistant-chat';
import { zodValidationFailure } from '@/lib/services/_shared/result-helpers';
import type { InvoiceStatus } from '@prisma/client';
import { getConversation } from '@/lib/services/conversations/conversations';
import { deleteConversation as deleteConversationSvc, deleteAllConversations as deleteAllConversationsSvc } from '@/lib/services/conversations/delete';
import type { DraftCardView, LinkedInvoiceState, OfferView } from '@/types/assistant/types';
import { fail, ok, type ActionResult } from '@/types/result';

/** The Create press on a Draft card (critical flow 2): not a message, so the allowance is untouched. */
export async function createDraftFromCard(cardId: string): Promise<ActionResult<CreateFromCardResult>> {
  const actor = await actingFreelancerFromSession();
  if (!actor.success) return actor;

  const result = await createFromCard(actor.data, cardId, new Date());
  if (result.success && result.data.kind === 'CREATED') revalidatePath(protectedRoutes.invoices);
  return result;
}

/**
 * The Draft cards and invoice-link states of a Conversation the chat started on /ai (fix 2026-10-12): the
 * island stays mounted there while the address becomes /ai/{id}, so it reads them here instead of navigating.
 * ai-chat-v2 T11: also the Offered choices, exactly as getConversation returns them (AC-12, AC-13).
 */
export async function loadConversationCards(
  id: string
): Promise<
  ActionResult<{
    cards: Record<string, DraftCardView>;
    invoiceLinks: Record<string, LinkedInvoiceState>;
    offers: Record<string, OfferView>;
  }>
> {
  const actor = await actingFreelancerFromSession();
  if (!actor.success) return actor;

  const result = await getConversation(actor.data, id);
  if (!result.success) return result;
  return ok({ cards: result.data.cards, invoiceLinks: result.data.invoiceLinks, offers: result.data.offers });
}

export async function deleteConversation(id: string): Promise<ActionResult<void>> {
  const actor = await actingFreelancerFromSession();
  if (!actor.success) return actor;

  const result = await deleteConversationSvc(actor.data, id);
  if (result.success) revalidatePath(protectedRoutes.ai);
  return result;
}

export async function deleteAllConversations(): Promise<ActionResult<{ deleted: number }>> {
  const actor = await actingFreelancerFromSession();
  if (!actor.success) return actor;

  const result = await deleteAllConversationsSvc(actor.data);
  if (result.success) revalidatePath(protectedRoutes.ai);
  return result;
}

const PREVIEW_NOT_FOUND = "This invoice can't be found.";
const PREVIEW_FAILED = "The preview couldn't be loaded. Try again.";
const ISSUE_NOT_FOUND = 'This invoice is no longer available.';
const ISSUE_FAILED = "The invoice couldn't be issued. Try again.";

/**
 * ai-chat-v2 T17 (AC-20, AC-21, AC-22, AC-27; ADR-0006): a created Draft card's invoice preview. Read-only,
 * never a message, never counted.
 */
export async function loadInvoicePreview(
  cardId: string,
  conversationId: string
): Promise<ActionResult<InvoicePreview>> {
  const actor = await actingFreelancerFromSession();
  if (!actor.success) return actor;
  if (typeof cardId !== 'string' || cardId.length === 0 || cardId.length > 64) {
    return fail('NOT_FOUND', PREVIEW_NOT_FOUND);
  }
  // The open Conversation: a card of another Conversation, or no valid Conversation at all, is not found (R9-2, R10-1).
  if (typeof conversationId !== 'string' || conversationId.length === 0 || conversationId.length > 64) {
    return fail('NOT_FOUND', PREVIEW_NOT_FOUND);
  }

  const result = await getCardInvoicePreview(actor.data, cardId, conversationId);
  if (!result.success && result.code === 'FAILED') return fail('FAILED', PREVIEW_FAILED);
  return result;
}

/**
 * ai-chat-v2 T17 (AC-23, AC-25, AC-26, AC-26b, AC-27; ADR-0007): issues a draft from the chat's preview through
 * the invoice status service, guarded by the version the preview showed. Never a message, never counted; the
 * model has no tool that reaches it.
 */
export async function issueFromPreview(
  invoiceId: string,
  expectedVersion: number
): Promise<ActionResult<{ status: InvoiceStatus; version: number; invoice: LinkedInvoiceState }>> {
  const actor = await actingFreelancerFromSession();
  if (!actor.success) return actor;
  const input = issueFromPreviewInputSchema.safeParse({ invoiceId, expectedVersion });
  if (!input.success) {
    return zodValidationFailure(input.error, "This invoice couldn't be issued: the request was not valid.");
  }

  const result = await issueInvoiceFromPreview(actor.data, input.data.invoiceId, input.data.expectedVersion);
  if (!result.success) {
    if (result.code === 'NOT_FOUND') return fail('NOT_FOUND', ISSUE_NOT_FOUND);
    if (result.code === 'FAILED') return fail('FAILED', ISSUE_FAILED);
  }
  if (result.success || result.code === 'CONFLICT') {
    revalidatePath(protectedRoutes.invoices);
    revalidatePath(protectedRoutes.dashboard);
  }
  return result;
}
