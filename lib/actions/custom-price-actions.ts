'use server';

import { prisma } from '@/prisma';
import { getAuthenticatedUser } from '@/lib/helpers/auth-helpers';
import {
  customPriceSchema,
  updateCustomPriceSchema,
  CustomPriceSchemaValues,
  UpdateCustomPriceValues,
} from '@/lib/validations/custom-price';
import { revalidatePath } from 'next/cache';
import { protectedRoutes } from '@/config/routes.config';
import {
  CustomPriceWithRelations,
  SerializedCustomPrice,
} from '@/types/custom-price/types';
import { ActionResult, ok, fail } from '@/types/actions';
import { z } from 'zod';
import { failed, zodValidationFailure } from '@/lib/actions/action-result-helpers';

const NOT_FOUND_MESSAGE = 'Customer or product not found.';

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
    return failed('Error fetching custom prices:', error, 'Failed to fetch custom prices.');
  }
}

export async function createCustomPrice(
  data: CustomPriceSchemaValues
): Promise<ActionResult<{ id: string }>> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success) {
      return authResult;
    }

    const { userId } = authResult.data;

    let validatedData: CustomPriceSchemaValues;
    try {
      validatedData = customPriceSchema.parse(data);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return zodValidationFailure(error);
      }
      throw error;
    }

    const { customerId, productId } = validatedData;

    const [customer, product] = await Promise.all([
      prisma.customer.findFirst({ where: { id: customerId, userId } }),
      prisma.product.findFirst({ where: { id: productId, userId } }),
    ]);

    if (!customer || !product) {
      return fail('NOT_FOUND', NOT_FOUND_MESSAGE);
    }

    const customPrice = await prisma.customPrice.create({
      data: {
        customerId,
        productId,
        name: validatedData.name,
        price: validatedData.price,
        notes: validatedData.notes,
      },
    });

    revalidatePath(protectedRoutes.customerDetail(customerId));
    revalidatePath(protectedRoutes.productCustomPrices(productId));

    return ok({ id: customPrice.id });
  } catch (error) {
    return failed('Error creating custom price:', error, 'Failed to create custom price.');
  }
}

export async function updateCustomPrice(
  id: string,
  data: UpdateCustomPriceValues
): Promise<ActionResult> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success) {
      return authResult;
    }

    const { userId } = authResult.data;

    let validatedData: UpdateCustomPriceValues;
    try {
      validatedData = updateCustomPriceSchema.parse(data);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return zodValidationFailure(error);
      }
      throw error;
    }

    const existingCustomPrice = await prisma.customPrice.findFirst({
      where: {
        id,
        customer: { userId },
      },
      select: {
        customerId: true,
        productId: true,
      },
    });

    if (!existingCustomPrice) {
      return fail('NOT_FOUND', NOT_FOUND_MESSAGE);
    }

    await prisma.customPrice.update({
      where: { id },
      data: {
        name: validatedData.name,
        price: validatedData.price,
        notes: validatedData.notes,
      },
    });

    revalidatePath(protectedRoutes.customerDetail(existingCustomPrice.customerId));
    revalidatePath(protectedRoutes.productCustomPrices(existingCustomPrice.productId));

    return ok();
  } catch (error) {
    return failed('Error updating custom price:', error, 'Failed to update custom price.');
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
    return failed('Error fetching product custom prices:', error, 'Failed to fetch custom prices.');
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
    return failed('Error deleting custom price:', error, 'Failed to delete custom price.');
  }
}
