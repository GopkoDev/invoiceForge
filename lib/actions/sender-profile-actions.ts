'use server';

import { revalidatePath } from 'next/cache';
import { protectedRoutes } from '@/config/routes.config';
import { SenderProfileFormValues } from '@/lib/validations/sender-profile';
import { SenderProfileWithRelations } from '@/types/sender-profile/types';
import { SenderProfile } from '@prisma/client';
import { ActionResult, ok } from '@/types/actions';
import { actingFreelancerFromSession } from '@/lib/helpers/session-actor';
import * as senderProfiles from '@/lib/services/sender-profiles/sender-profiles';

export async function createSenderProfile(
  data: SenderProfileFormValues
): Promise<ActionResult<SenderProfile>> {
  const actor = await actingFreelancerFromSession();
  if (!actor.success) return actor;
  const result = await senderProfiles.createSenderProfile(actor.data, data);
  if (result.success) revalidatePath(protectedRoutes.senderProfiles);
  return result;
}

export async function updateSenderProfile(
  id: string,
  data: SenderProfileFormValues
): Promise<ActionResult<SenderProfile>> {
  const actor = await actingFreelancerFromSession();
  if (!actor.success) return actor;
  const result = await senderProfiles.updateSenderProfile(actor.data, id, data);
  if (result.success) revalidatePath(protectedRoutes.senderProfiles);
  return result;
}

export async function deleteSenderProfile(id: string): Promise<ActionResult> {
  const actor = await actingFreelancerFromSession();
  if (!actor.success) return actor;
  const result = await senderProfiles.deleteSenderProfile(actor.data, id);
  if (result.success) revalidatePath(protectedRoutes.senderProfiles);
  return result;
}

export async function getSenderProfiles(): Promise<
  ActionResult<SenderProfileWithRelations[]>
> {
  const actor = await actingFreelancerFromSession();
  if (!actor.success) return actor;
  const result = await senderProfiles.listSenderProfiles(actor.data);
  return result.success ? ok(result.data.items) : result;
}

export async function getSenderProfile(
  id: string
): Promise<ActionResult<SenderProfileWithRelations>> {
  const actor = await actingFreelancerFromSession();
  if (!actor.success) return actor;
  return senderProfiles.getSenderProfile(actor.data, id);
}
