'use server';

import { ActionResult, fail } from '@/types/actions';
import { actingFreelancerFromSession } from '@/lib/helpers/session-actor';
import * as account from '@/lib/services/account/account';

/** Invoices that would be lost if the caller deletes their account (AC-20). */
export async function getAccountDeletionSummary(): Promise<
  ActionResult<{ invoiceCount: number }>
> {
  const actor = await actingFreelancerFromSession();
  if (!actor.success) return actor;
  return account.getAccountDeletionSummary(actor.data);
}

/** All-or-nothing account deletion (adr/0007, AC-20); the session is verified here first. */
export async function deleteUserAccount(): Promise<ActionResult<void>> {
  const actor = await actingFreelancerFromSession();
  if (!actor.success) return actor;
  const result = await account.deleteAccount(actor.data);
  if (!result.success && result.code === 'NOT_FOUND') {
    return fail('UNAUTHORIZED', 'Not signed in.');
  }
  return result;
}
