'use server';

import { revalidatePath } from 'next/cache';
import { protectedRoutes } from '@/config/routes.config';
import { actingFreelancerFromSession } from '@/lib/helpers/session-actor';
import * as personalKeys from '@/lib/services/personal-keys/personal-keys';
import { liftKeyDraftLimit as liftLimit } from '@/lib/services/assistant-usage/key-drafts';
import type { CreatedPersonalKey } from '@/lib/services/personal-keys/personal-keys';
import type { ActionResult } from '@/types/result';

export async function createPersonalKey(input: {
  name: string;
  canCreateDrafts?: boolean;
}): Promise<ActionResult<{ key: CreatedPersonalKey; fullKey: string }>> {
  const actor = await actingFreelancerFromSession();
  if (!actor.success) return actor;

  const result = await personalKeys.createPersonalKey(actor.data, input);
  if (result.success) revalidatePath(protectedRoutes.settingsAssistants);
  return result;
}

export async function revokePersonalKey(id: string): Promise<ActionResult<void>> {
  const actor = await actingFreelancerFromSession();
  if (!actor.success) return actor;

  const result = await personalKeys.revokePersonalKey(actor.data, id);
  if (result.success) revalidatePath(protectedRoutes.settingsAssistants);
  return result;
}

export async function liftKeyDraftLimit(
  keyId: string,
): Promise<ActionResult<{ created: number; allowance: number; lastLiftedAt: string }>> {
  const actor = await actingFreelancerFromSession();
  if (!actor.success) return actor;

  const result = await liftLimit(actor.data, keyId, new Date());
  if (result.success) revalidatePath(protectedRoutes.settingsAssistants);
  return result;
}
