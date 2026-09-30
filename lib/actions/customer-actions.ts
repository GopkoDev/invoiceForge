'use server';

import { revalidatePath } from 'next/cache';
import { protectedRoutes } from '@/config/routes.config';
import type { CustomerFormValues } from '@/lib/validations/customer';
import type { CustomerWithRelations } from '@/types/customer/types';
import type { ActionResult } from '@/types/actions';
import { actingFreelancerFromSession } from '@/lib/helpers/session-actor';
import * as customers from '@/lib/services/customers/customers';

export async function getCustomers(): Promise<ActionResult<CustomerWithRelations[]>> {
  const actor = await actingFreelancerFromSession();
  if (!actor.success) return actor;
  const result = await customers.listCustomers(actor.data);
  if (!result.success) return result;
  return { success: true, data: result.data.items };
}

export async function getCustomer(id: string): Promise<ActionResult<CustomerWithRelations>> {
  const actor = await actingFreelancerFromSession();
  if (!actor.success) return actor;
  return customers.getCustomer(actor.data, id);
}

export async function createCustomer(data: CustomerFormValues): Promise<ActionResult<{ id: string }>> {
  const actor = await actingFreelancerFromSession();
  if (!actor.success) return actor;
  const result = await customers.createCustomer(actor.data, data);
  if (result.success) revalidatePath(protectedRoutes.customers);
  return result;
}

export async function updateCustomer(id: string, data: CustomerFormValues): Promise<ActionResult> {
  const actor = await actingFreelancerFromSession();
  if (!actor.success) return actor;
  const result = await customers.updateCustomer(actor.data, id, data);
  if (result.success) {
    revalidatePath(protectedRoutes.customers);
    revalidatePath(protectedRoutes.customerEdit(id));
  }
  return result;
}

export async function deleteCustomer(id: string): Promise<ActionResult> {
  const actor = await actingFreelancerFromSession();
  if (!actor.success) return actor;
  const result = await customers.deleteCustomer(actor.data, id);
  if (result.success) revalidatePath(protectedRoutes.customers);
  return result;
}
