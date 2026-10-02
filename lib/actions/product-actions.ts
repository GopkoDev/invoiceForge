'use server';

import { revalidatePath } from 'next/cache';
import { protectedRoutes } from '@/config/routes.config';
import type { ProductFormValues } from '@/lib/validations/product';
import type { SerializedProduct } from '@/types/product/types';
import { ok, type ActionResult } from '@/types/actions';
import { actingFreelancerFromSession } from '@/lib/helpers/session-actor';
import * as products from '@/lib/services/products/products';

export async function getProducts({
  onlyActive,
}: { onlyActive?: boolean } = {}): Promise<ActionResult<SerializedProduct[]>> {
  const actor = await actingFreelancerFromSession();
  if (!actor.success) return actor;

  const result = await products.listProducts(actor.data, { onlyActive });
  if (!result.success) return result;
  return ok(result.data.items);
}

export async function getProduct(id: string): Promise<ActionResult<SerializedProduct>> {
  const actor = await actingFreelancerFromSession();
  if (!actor.success) return actor;

  return products.getProduct(actor.data, id);
}

export async function createProduct(
  data: ProductFormValues,
): Promise<ActionResult<{ id: string }>> {
  const actor = await actingFreelancerFromSession();
  if (!actor.success) return actor;

  const result = await products.createProduct(actor.data, data);
  if (result.success) revalidatePath(protectedRoutes.products);
  return result;
}

export async function updateProduct(
  id: string,
  data: ProductFormValues,
): Promise<ActionResult> {
  const actor = await actingFreelancerFromSession();
  if (!actor.success) return actor;

  const result = await products.updateProduct(actor.data, id, data);
  if (result.success) {
    revalidatePath(protectedRoutes.products);
    revalidatePath(protectedRoutes.productEdit(id));
  }
  return result;
}

export async function deleteProduct(id: string): Promise<ActionResult> {
  const actor = await actingFreelancerFromSession();
  if (!actor.success) return actor;

  const result = await products.deleteProduct(actor.data, id);
  if (result.success) revalidatePath(protectedRoutes.products);
  return result;
}

export async function toggleProductActive(id: string): Promise<ActionResult> {
  const actor = await actingFreelancerFromSession();
  if (!actor.success) return actor;

  const result = await products.toggleProductActive(actor.data, id);
  if (result.success) revalidatePath(protectedRoutes.products);
  return result;
}
