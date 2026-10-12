'use server';

import { revalidatePath } from 'next/cache';
import { protectedRoutes } from '@/config/routes.config';
import { actingFreelancerFromSession } from '@/lib/helpers/session-actor';
import { createFromCard, type CreateFromCardResult } from '@/lib/services/assistant-drafts/cards';
import { deleteConversation as deleteConversationSvc, deleteAllConversations as deleteAllConversationsSvc } from '@/lib/services/conversations/delete';
import type { ActionResult } from '@/types/result';

/** The Create press on a Draft card (critical flow 2): not a message, so the allowance is untouched. */
export async function createDraftFromCard(cardId: string): Promise<ActionResult<CreateFromCardResult>> {
  const actor = await actingFreelancerFromSession();
  if (!actor.success) return actor;

  const result = await createFromCard(actor.data, cardId, new Date());
  if (result.success && result.data.kind === 'CREATED') revalidatePath(protectedRoutes.invoices);
  return result;
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
