'use server';

import { revalidatePath } from 'next/cache';
import { protectedRoutes } from '@/config/routes.config';
import {
  CustomPriceSchemaValues,
  UpdateCustomPriceValues,
} from '@/lib/validations/custom-price';
import { SerializedCustomPrice } from '@/types/custom-price/types';
import { ActionResult, ok } from '@/types/actions';
import { actingFreelancerFromSession } from '@/lib/helpers/session-actor';
import {
  createCustomPrice as createCustomPriceService,
  deleteCustomPrice as deleteCustomPriceService,
  listCustomerCustomPrices,
  listProductCustomPrices,
  updateCustomPrice as updateCustomPriceService,
} from '@/lib/services/custom-prices/custom-prices';

export async function getCustomerCustomPrices(
  customerId: string
): Promise<ActionResult<SerializedCustomPrice[]>> {
  const actor = await actingFreelancerFromSession();
  if (!actor.success) return actor;
  const result = await listCustomerCustomPrices(actor.data, customerId);
  return result.success ? ok(result.data.items) : result;
}

export async function createCustomPrice(
  data: CustomPriceSchemaValues
): Promise<ActionResult<{ id: string }>> {
  const actor = await actingFreelancerFromSession();
  if (!actor.success) return actor;
  const result = await createCustomPriceService(actor.data, data);
  if (result.success) {
    revalidatePath(protectedRoutes.customerDetail(data.customerId));
    revalidatePath(protectedRoutes.productCustomPrices(data.productId));
  }
  return result;
}

export async function updateCustomPrice(
  id: string,
  data: UpdateCustomPriceValues
): Promise<ActionResult> {
  const actor = await actingFreelancerFromSession();
  if (!actor.success) return actor;
  const result = await updateCustomPriceService(actor.data, id, data);
  if (!result.success) return result;
  revalidatePath(protectedRoutes.customerDetail(result.data.customerId));
  revalidatePath(protectedRoutes.productCustomPrices(result.data.productId));
  return ok();
}

export async function getProductCustomPrices(
  productId: string
): Promise<ActionResult<SerializedCustomPrice[]>> {
  const actor = await actingFreelancerFromSession();
  if (!actor.success) return actor;
  const result = await listProductCustomPrices(actor.data, productId);
  return result.success ? ok(result.data.items) : result;
}

export async function deleteCustomPrice(
  id: string,
  customerId: string,
  productId?: string
): Promise<ActionResult> {
  const actor = await actingFreelancerFromSession();
  if (!actor.success) return actor;
  const result = await deleteCustomPriceService(actor.data, id, customerId);
  if (!result.success) return result;
  revalidatePath(protectedRoutes.customerDetail(customerId));
  revalidatePath(protectedRoutes.productCustomPrices(productId || result.data.productId));
  return ok();
}
