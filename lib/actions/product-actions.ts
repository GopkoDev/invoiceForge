'use server';

import { prisma } from '@/prisma';
import { getAuthenticatedUser } from '@/lib/helpers/auth-helpers';
import {
  productFormSchema,
  ProductFormValues,
} from '@/lib/validations/product';
import { revalidatePath } from 'next/cache';
import { protectedRoutes } from '@/config/routes.config';
import { ProductWithRelations, SerializedProduct } from '@/types/product/types';
import { ActionResult, ok, fail } from '@/types/actions';
import { z } from 'zod';
import { failed, zodValidationFailure } from '@/lib/actions/action-result-helpers';

// Helper to serialize Decimal to number for client components
function serializeProduct(product: ProductWithRelations): SerializedProduct {
  return {
    ...product,
    price: Number(product.price),
  };
}

export async function getProducts({
  onlyActive,
}: { onlyActive?: boolean } = {}): Promise<ActionResult<SerializedProduct[]>> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success) {
      return authResult;
    }

    const { userId } = authResult.data;

    const products = await prisma.product.findMany({
      where: {
        userId,
        ...(onlyActive ? { isActive: true } : {}),
      },
      include: {
        _count: {
          select: {
            invoiceItems: true,
            customPrices: true,
          },
        },
      },

      orderBy: [
        {
          isActive: 'desc',
        },
        {
          createdAt: 'desc',
        },
      ],
    });

    return ok(products.map(serializeProduct));
  } catch (error) {
    return failed('Error fetching products:', error, 'Failed to fetch products.');
  }
}

export async function getProduct(
  id: string
): Promise<ActionResult<SerializedProduct>> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success) {
      return authResult;
    }

    const { userId } = authResult.data;

    const product = await prisma.product.findFirst({
      where: {
        id,
        userId,
      },
      include: {
        _count: {
          select: {
            invoiceItems: true,
            customPrices: true,
          },
        },
      },
    });

    if (!product) {
      return fail('NOT_FOUND', 'Product not found.');
    }

    return ok(serializeProduct(product));
  } catch (error) {
    return failed('Error fetching product:', error, 'Failed to fetch product.');
  }
}

export async function createProduct(
  data: ProductFormValues
): Promise<ActionResult<{ id: string }>> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success) {
      return authResult;
    }

    const { userId } = authResult.data;
    const validatedData = productFormSchema.parse(data);

    const product = await prisma.product.create({
      data: {
        ...validatedData,
        userId,
        price: parseFloat(validatedData.price),
      },
    });

    revalidatePath(protectedRoutes.products);

    return ok({ id: product.id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return zodValidationFailure(error);
    }
    return failed('Error creating product:', error, 'Failed to create product.');
  }
}

export async function updateProduct(
  id: string,
  data: ProductFormValues
): Promise<ActionResult> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success) {
      return authResult;
    }

    const { userId } = authResult.data;
    const validatedData = productFormSchema.parse(data);

    const existingProduct = await prisma.product.findFirst({
      where: {
        id,
        userId,
      },
      include: {
        _count: {
          select: {
            invoiceItems: true,
            customPrices: true,
          },
        },
      },
    });

    if (!existingProduct) {
      return fail('NOT_FOUND', 'Product not found.');
    }

    if (existingProduct._count.invoiceItems > 0) {
      if (validatedData.currency !== existingProduct.currency) {
        return fail(
          'CONFLICT',
          `Cannot change currency for product used in ${existingProduct._count.invoiceItems} invoice(s). Create a new product instead.`,
        );
      }
      if (validatedData.unit !== existingProduct.unit) {
        return fail(
          'CONFLICT',
          `Cannot change unit of measure for product used in ${existingProduct._count.invoiceItems} invoice(s). Create a new product instead.`,
        );
      }
    }

    await prisma.product.update({
      where: { id },
      data: {
        ...validatedData,
        price: parseFloat(validatedData.price),
      },
    });

    revalidatePath(protectedRoutes.products);
    revalidatePath(protectedRoutes.productEdit(id));

    return ok();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return zodValidationFailure(error);
    }
    return failed('Error updating product:', error, 'Failed to update product.');
  }
}

export async function deleteProduct(id: string): Promise<ActionResult> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success) {
      return authResult;
    }

    const { userId } = authResult.data;

    const product = await prisma.product.findFirst({
      where: {
        id,
        userId,
      },
      include: {
        _count: {
          select: {
            invoiceItems: true,
          },
        },
      },
    });

    if (!product) {
      return fail('NOT_FOUND', 'Product not found.');
    }

    if (product._count.invoiceItems > 0) {
      return fail(
        'CONFLICT',
        `Cannot delete product used in ${product._count.invoiceItems} invoice(s). Consider deactivating it instead.`,
      );
    }

    // Note: CustomPrices will be automatically deleted due to onDelete: Cascade in schema
    await prisma.product.delete({
      where: { id },
    });

    revalidatePath(protectedRoutes.products);

    return ok();
  } catch (error) {
    return failed('Error deleting product:', error, 'Failed to delete product.');
  }
}

export async function toggleProductActive(id: string): Promise<ActionResult> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success) {
      return authResult;
    }

    const { userId } = authResult.data;

    const product = await prisma.product.findFirst({
      where: {
        id,
        userId,
      },
    });

    if (!product) {
      return fail('NOT_FOUND', 'Product not found.');
    }

    await prisma.product.update({
      where: { id },
      data: {
        isActive: !product.isActive,
      },
    });

    revalidatePath(protectedRoutes.products);

    return ok();
  } catch (error) {
    return failed('Error toggling product status:', error, 'Failed to update product status.');
  }
}
