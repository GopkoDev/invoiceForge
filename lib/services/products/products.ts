import 'server-only';
import { prisma } from '@/prisma';
import { productFormSchema, type ProductFormValues } from '@/lib/validations/product';
import type { ProductWithRelations, SerializedProduct } from '@/types/product/types';
import { fail, ok, type ActionResult } from '@/types/result';
import { failed, zodValidationFailure } from '@/lib/services/_shared/result-helpers';
import { notFoundOnMiss } from '@/lib/services/_shared/owner-scope';
import { ilikeAny, paginate, parseListQuery, type ListQuery, type Page } from '@/lib/services/_shared/list-query';
import type { ActingFreelancer } from '@/lib/services/_shared/acting-freelancer';

const NOT_FOUND_MESSAGE = 'Product not found.';

function serializeProduct(product: ProductWithRelations): SerializedProduct {
  return { ...product, price: Number(product.price) };
}

const withCounts = {
  _count: { select: { invoiceItems: true, customPrices: true } },
} as const;

export async function listProducts(
  actor: ActingFreelancer,
  query?: ListQuery & { onlyActive?: boolean },
): Promise<ActionResult<Page<SerializedProduct>>> {
  try {
    const { onlyActive, ...listInput } = query ?? {};
    const parsed = parseListQuery(listInput);
    if (!parsed.success) return parsed;

    const where = {
      userId: actor.userId,
      ...(onlyActive ? { isActive: true } : {}),
      ...ilikeAny(['name'], parsed.data.search ?? ''),
    };

    const page = await paginate({
      query: parsed.data,
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
      count: () => prisma.product.count({ where }),
      findMany: ({ skip, take, orderBy }) =>
        prisma.product.findMany({
          where,
          include: withCounts,
          orderBy: orderBy as never,
          skip,
          take,
        }),
    });

    return ok({ ...page, items: page.items.map(serializeProduct) });
  } catch (error) {
    return failed('Error fetching products:', error, 'Failed to fetch products.');
  }
}

export async function getProduct(
  actor: ActingFreelancer,
  id: string,
): Promise<ActionResult<SerializedProduct>> {
  try {
    const product = await prisma.product.findFirst({
      where: { id, userId: actor.userId },
      include: withCounts,
    });
    if (!product) return fail('NOT_FOUND', NOT_FOUND_MESSAGE);
    return ok(serializeProduct(product));
  } catch (error) {
    return failed('Error fetching product:', error, 'Failed to fetch product.');
  }
}

export async function createProduct(
  actor: ActingFreelancer,
  input: ProductFormValues,
): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = productFormSchema.safeParse(input);
    if (!parsed.success) return zodValidationFailure(parsed.error);

    const product = await prisma.product.create({
      data: {
        ...parsed.data,
        userId: actor.userId,
      },
    });
    return ok({ id: product.id });
  } catch (error) {
    return failed('Error creating product:', error, 'Failed to create product.');
  }
}

export async function updateProduct(
  actor: ActingFreelancer,
  id: string,
  input: ProductFormValues,
): Promise<ActionResult> {
  try {
    const parsed = productFormSchema.safeParse(input);
    if (!parsed.success) return zodValidationFailure(parsed.error);
    const validatedData = parsed.data;

    // T25 (review F7): read, count and write in one transaction under the owner's product row lock,
    // so an invoice line can't land on the product between the usage count and the update.
    return await prisma.$transaction(async (tx): Promise<ActionResult> => {
      const locked = await tx.$queryRaw<{ locked: number }[]>`
        SELECT 1 AS locked FROM "Product" WHERE id = ${id} AND "userId" = ${actor.userId} FOR UPDATE`;
      if (locked.length === 0) return fail('NOT_FOUND', NOT_FOUND_MESSAGE);

      const existing = await tx.product.findFirst({
        where: { id, userId: actor.userId },
        include: withCounts,
      });
      if (!existing) return fail('NOT_FOUND', NOT_FOUND_MESSAGE);

      // invoice-integrity T13 (AC-13b): the currency lock counts invoices in any status, not lines.
      // T25 (review S1): the owner is in the count's own WHERE.
      if (validatedData.currency !== existing.currency) {
        const usedBy = await tx.invoiceItem.groupBy({
          by: ['invoiceId'],
          where: { productId: id, product: { userId: actor.userId } },
        });
        const invoiceCount = usedBy.length;
        if (invoiceCount > 0) {
          const message = `The currency of a product used on ${invoiceCount} invoice(s) can't change.`;
          return fail('CONFLICT', message, {
            fieldErrors: { currency: [message] },
            details: { kind: 'HAS_INVOICES', invoiceCount },
          });
        }
      }

      const used = existing._count.invoiceItems;
      if (used > 0 && validatedData.unit !== existing.unit) {
        return fail(
          'CONFLICT',
          `Cannot change unit of measure for product used in ${used} invoice(s). Create a new product instead.`,
        );
      }

      // The price is the number the schema validated (T25, review F5).
      const written = await notFoundOnMiss(
        tx.product.update({ where: { id, userId: actor.userId }, data: validatedData }),
        NOT_FOUND_MESSAGE,
      );
      if ('success' in written) return written;
      return ok();
    });
  } catch (error) {
    return failed('Error updating product:', error, 'Failed to update product.');
  }
}

export async function deleteProduct(actor: ActingFreelancer, id: string): Promise<ActionResult> {
  try {
    const product = await prisma.product.findFirst({
      where: { id, userId: actor.userId },
      include: { _count: { select: { invoiceItems: true } } },
    });
    if (!product) return fail('NOT_FOUND', NOT_FOUND_MESSAGE);

    if (product._count.invoiceItems > 0) {
      return fail(
        'CONFLICT',
        `Cannot delete product used in ${product._count.invoiceItems} invoice(s). Consider deactivating it instead.`,
      );
    }

    // CustomPrices are removed by onDelete: Cascade in the schema.
    const written = await notFoundOnMiss(
      prisma.product.delete({ where: { id, userId: actor.userId } }),
      NOT_FOUND_MESSAGE,
    );
    if ('success' in written) return written;
    return ok();
  } catch (error) {
    return failed('Error deleting product:', error, 'Failed to delete product.');
  }
}

export async function toggleProductActive(actor: ActingFreelancer, id: string): Promise<ActionResult> {
  try {
    const product = await prisma.product.findFirst({ where: { id, userId: actor.userId } });
    if (!product) return fail('NOT_FOUND', NOT_FOUND_MESSAGE);

    const written = await notFoundOnMiss(
      prisma.product.update({
        where: { id, userId: actor.userId },
        data: { isActive: !product.isActive },
      }),
      NOT_FOUND_MESSAGE,
    );
    if ('success' in written) return written;
    return ok();
  } catch (error) {
    return failed('Error toggling product status:', error, 'Failed to update product status.');
  }
}
