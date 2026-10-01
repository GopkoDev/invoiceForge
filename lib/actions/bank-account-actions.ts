'use server';

import { revalidatePath } from 'next/cache';
import { protectedRoutes } from '@/config/routes.config';
import type { BankAccountFormValues } from '@/lib/validations/bank-account';
import type { BankAccountWithRelations } from '@/types/sender-profile/types';
import { ok, type ActionResult } from '@/types/actions';
import type { BankAccount } from '@prisma/client';
import { actingFreelancerFromSession } from '@/lib/helpers/session-actor';
import * as bankAccounts from '@/lib/services/bank-accounts/bank-accounts';

function revalidateBankAccountPages(senderProfileId: string) {
  revalidatePath(protectedRoutes.senderProfiles);
  revalidatePath(protectedRoutes.senderProfileEdit(senderProfileId));
  revalidatePath(protectedRoutes.senderProfileEditBankAccounts(senderProfileId));
}

export async function createBankAccount(
  senderProfileId: string,
  data: BankAccountFormValues,
): Promise<ActionResult<BankAccount>> {
  const actor = await actingFreelancerFromSession();
  if (!actor.success) return actor;

  const result = await bankAccounts.createBankAccount(actor.data, senderProfileId, data);
  if (result.success) revalidateBankAccountPages(senderProfileId);
  return result;
}

export async function updateBankAccount(
  id: string,
  data: BankAccountFormValues,
): Promise<ActionResult<BankAccount>> {
  const actor = await actingFreelancerFromSession();
  if (!actor.success) return actor;

  const result = await bankAccounts.updateBankAccount(actor.data, id, data);
  if (result.success) revalidateBankAccountPages(result.data.senderProfileId);
  return result;
}

export async function deleteBankAccount(id: string): Promise<ActionResult> {
  const actor = await actingFreelancerFromSession();
  if (!actor.success) return actor;

  const result = await bankAccounts.deleteBankAccount(actor.data, id);
  if (!result.success) return result;
  revalidateBankAccountPages(result.data.senderProfileId);
  return ok();
}

export async function getBankAccounts(
  senderProfileId: string,
  limit?: number,
): Promise<ActionResult<BankAccountWithRelations[]>> {
  const actor = await actingFreelancerFromSession();
  if (!actor.success) return actor;

  const result = await bankAccounts.listBankAccounts(
    actor.data,
    senderProfileId,
    limit ? { page: 1, pageSize: limit } : undefined,
  );
  if (!result.success) return result;
  return ok(result.data.items);
}
