'use server';

import { revalidatePath } from 'next/cache';
import { ProfileFormValues } from '@/lib/validations/profile';
import { ActionResult, fail } from '@/types/actions';
import { actingFreelancerFromSession } from '@/lib/helpers/session-actor';
import * as profile from '@/lib/services/profile/profile';

export async function updateProfile(
  data: ProfileFormValues
): Promise<ActionResult<void>> {
  const actor = await actingFreelancerFromSession();
  if (!actor.success) return actor;
  const result = await profile.updateProfile(actor.data, data);
  if (!result.success && result.code === 'NOT_FOUND') {
    return fail('UNAUTHORIZED', 'Not signed in.');
  }
  return result;
}

export async function updateTimeZone(timeZone: string): Promise<ActionResult<void>> {
  const actor = await actingFreelancerFromSession();
  if (!actor.success) return actor;
  const result = await profile.updateTimeZone(actor.data, timeZone);
  if (!result.success && result.code === 'NOT_FOUND') {
    return fail('UNAUTHORIZED', 'Not signed in.');
  }
  if (result.success) revalidatePath('/', 'layout');
  return result;
}
