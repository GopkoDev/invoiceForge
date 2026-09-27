'use server';

import { prisma } from '@/prisma';
import { getAuthenticatedUser } from '@/lib/helpers/auth-helpers';
import {
  customPriceFormSchema,
  CustomPriceFormValues,
} from '@/lib/validations/custom-price';
import { revalidatePath } from 'next/cache';
import { protectedRoutes } from '@/config/routes.config';
import {
  CustomPriceWithRelations,
  SerializedCustomPrice,
} from '@/types/custom-price/types';
import { ActionResult, ok, fail } from '@/types/actions';
import { z } from 'zod';
import { zodValidationFailure } from '@/lib/actions/action-result-helpers';
import type { Prisma } from '@prisma/client';

function serializeCustomPrice(
  customPrice: CustomPriceWithRelations
): SerializedCustomPrice {
  return {
    ...customPrice,
    price: Number(customPrice.price),
    product: {
      ...customPrice.product,
      price: Number(customPrice.product.price),
    },
  };
}

export async function getCustomerCustomPrices(
  customerId: string
): Promise<ActionResult<SerializedCustomPrice[]>> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success) {
      return authResult;
    }

    const { userId } = authResult.data;

    const customer = await prisma.customer.findFirst({
      where: {
        id: customerId,
        userId,
      },
    });

    if (!customer) {
      return fail('NOT_FOUND', 'Customer not found.');
    }

    const customPrices = await prisma.customPrice.findMany({
      where: {
        customerId,
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            price: true,
            currency: true,
            unit: true,
            isActive: true,
          },
        },
        customer: {
          select: {
            id: true,
            name: true,
            companyName: true,
          },
        },
      },
      orderBy: {
        product: {
          name: 'asc',
        },
      },
    });

    return ok(
      customPrices.map((cp) => serializeCustomPrice(cp as CustomPriceWithRelations)),
    );
  } catch (error) {
    console.error('Error fetching custom prices:', error);
    return fail('FAILED', 'Failed to fetch custom prices.');
  }
}

export async function createCustomPrice(
  data: CustomPriceFormValues,
  context: { customerId?: string; productId?: string }
): Promise<ActionResult<{ id: string }>> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success) {
      return authResult;
    }

    const { userId } = authResult.data;

    const productId = context.productId || data.productId;
    const customerId = context.customerId || data.productId;

    const customer = await prisma.customer.findFirst({
      where: {
        id: customerId,
        userId,
      },
    });

    if (!customer) {
      return fail('NOT_FOUND', 'Customer not found.');
    }

    const product = await prisma.product.findFirst({
      where: {
        id: productId,
        userId,
      },
    });

    if (!product) {
      return fail('NOT_FOUND', 'Product not found.');
    }

    const validatedData = customPriceFormSchema.parse(data);

    const customPrice = await prisma.customPrice.create({
      data: {
        customerId,
        productId,
        name: validatedData.name,
        price: validatedData.price,
        notes: validatedData.notes,
      } as unknown as Prisma.CustomPriceUncheckedCreateInput,
    });

    revalidatePath(protectedRoutes.customerDetail(customerId));
    revalidatePath(protectedRoutes.productCustomPrices(productId));

    return ok({ id: customPrice.id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return zodValidationFailure(error);
    }
    console.error('Error creating custom price:', error);
    return fail('FAILED', 'Failed to create custom price.');
  }
}

export async function updateCustomPrice(
  id: string,
  customerId: string,
  data: Pick<CustomPriceFormValues, 'name' | 'price' | 'notes'>,
  productId?: string
): Promise<ActionResult> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success) {
      return authResult;
    }

    const { userId } = authResult.data;

    const customer = await prisma.customer.findFirst({
      where: {
        id: customerId,
        userId,
      },
    });

    if (!customer) {
      return fail('NOT_FOUND', 'Customer not found.');
    }

    const existingCustomPrice = await prisma.customPrice.findFirst({
      where: {
        id,
        customerId,
      },
      select: {
        productId: true,
      },
    });

    if (!existingCustomPrice) {
      return fail('NOT_FOUND', 'Custom price not found.');
    }

    const finalProductId = productId || existingCustomPrice.productId;

    await prisma.customPrice.update({
      where: { id },
      data: {
        name: data.name,
        price: data.price,
        notes: data.notes,
      } as unknown as Prisma.CustomPriceUncheckedUpdateInput,
    });

    revalidatePath(protectedRoutes.customerDetail(customerId));
    revalidatePath(protectedRoutes.productCustomPrices(finalProductId));

    return ok();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return zodValidationFailure(error);
    }
    console.error('Error updating custom price:', error);
    return fail('FAILED', 'Failed to update custom price.');
  }
}

export async function getProductCustomPrices(
  productId: string
): Promise<ActionResult<SerializedCustomPrice[]>> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success) {
      return authResult;
    }

    const { userId } = authResult.data;

    const product = await prisma.product.findFirst({
      where: {
        id: productId,
        userId,
      },
    });

    if (!product) {
      return fail('NOT_FOUND', 'Product not found.');
    }

    const customPrices = await prisma.customPrice.findMany({
      where: {
        productId,
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            price: true,
            currency: true,
            unit: true,
            isActive: true,
          },
        },
        customer: {
          select: {
            id: true,
            name: true,
            companyName: true,
          },
        },
      },
      orderBy: {
        customer: {
          name: 'asc',
        },
      },
    });

    return ok(
      customPrices.map((cp) => serializeCustomPrice(cp as CustomPriceWithRelations)),
    );
  } catch (error) {
    console.error('Error fetching product custom prices:', error);
    return fail('FAILED', 'Failed to fetch custom prices.');
  }
}

export async function deleteCustomPrice(
  id: string,
  customerId: string,
  productId?: string
): Promise<ActionResult> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success) {
      return authResult;
    }

    const { userId } = authResult.data;

    const customer = await prisma.customer.findFirst({
      where: {
        id: customerId,
        userId,
      },
    });

    if (!customer) {
      return fail('NOT_FOUND', 'Customer not found.');
    }

    const existingCustomPrice = await prisma.customPrice.findFirst({
      where: {
        id,
        customerId,
      },
      select: {
        productId: true,
      },
    });

    if (!existingCustomPrice) {
      return fail('NOT_FOUND', 'Custom price not found.');
    }

    const finalProductId = productId || existingCustomPrice.productId;

    await prisma.customPrice.delete({
      where: { id },
    });

    revalidatePath(protectedRoutes.customerDetail(customerId));
    revalidatePath(protectedRoutes.productCustomPrices(finalProductId));

    return ok();
  } catch (error) {
    console.error('Error deleting custom price:', error);
    return fail('FAILED', 'Failed to delete custom price.');
  }
}
