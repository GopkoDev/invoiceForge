import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/prisma';
import { fail, ok, type ActionResult } from '@/types/result';
import {
  customPriceSchema,
  updateCustomPriceSchema,
  type CustomPriceSchemaValues,
  type UpdateCustomPriceValues,
} from '@/lib/validations/custom-price';
import type {
  CustomPriceWithRelations,
  SerializedCustomPrice,
} from '@/types/custom-price/types';
import type { ActingFreelancer } from '@/lib/services/_shared/acting-freelancer';
import { escapeLike, paginate, parseListQuery, type ListQuery, type Page } from '@/lib/services/_shared/list-query';
import { notFoundOnMiss } from '@/lib/services/_shared/owner-scope';
import { failed, zodValidationFailure } from '@/lib/services/_shared/result-helpers';

const NOT_FOUND_MESSAGE = 'Customer or product not found.';

const include = {
  product: {
    select: { id: true, name: true, price: true, currency: true, unit: true, isActive: true },
  },
  customer: { select: { id: true, name: true, companyName: true } },
} satisfies Prisma.CustomPriceInclude;

function serializeCustomPrice(customPrice: CustomPriceWithRelations): SerializedCustomPrice {
  return {
    ...customPrice,
    price: Number(customPrice.price),
    product: { ...customPrice.product, price: Number(customPrice.product.price) },
  };
}

async function listCustomPrices(
  parent: Prisma.CustomPriceWhereInput,
  orderBy: Prisma.CustomPriceOrderByWithRelationInput[],
  query: ListQuery,
): Promise<Page<SerializedCustomPrice>> {
  const search = query.search ?? '';
  const where: Prisma.CustomPriceWhereInput =
    search === ''
      ? parent
      : {
          ...parent,
          OR: [
            { product: { name: { contains: escapeLike(search), mode: 'insensitive' } } },
            { customer: { name: { contains: escapeLike(search), mode: 'insensitive' } } },
          ],
        };
  return paginate({
    count: () => prisma.customPrice.count({ where }),
    findMany: async (args) => {
      const rows = await prisma.customPrice.findMany({
        where,
        include,
        skip: args.skip,
        take: args.take,
        orderBy: args.orderBy as Prisma.CustomPriceOrderByWithRelationInput[],
      });
      return rows.map(serializeCustomPrice);
    },
    orderBy,
    query,
  });
}

export async function listCustomerCustomPrices(
  actor: ActingFreelancer,
  customerId: string,
  query?: ListQuery,
): Promise<ActionResult<Page<SerializedCustomPrice>>> {
  try {
    const parsed = parseListQuery(query);
    if (!parsed.success) return parsed;
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, userId: actor.userId },
      select: { id: true },
    });
    if (!customer) return fail('NOT_FOUND', 'Customer not found.');
    return ok(await listCustomPrices({ customerId }, [{ product: { name: 'asc' } }], parsed.data));
  } catch (error) {
    return failed('Error fetching custom prices:', error, 'Failed to fetch custom prices.');
  }
}

export async function listProductCustomPrices(
  actor: ActingFreelancer,
  productId: string,
  query?: ListQuery,
): Promise<ActionResult<Page<SerializedCustomPrice>>> {
  try {
    const parsed = parseListQuery(query);
    if (!parsed.success) return parsed;
    const product = await prisma.product.findFirst({
      where: { id: productId, userId: actor.userId },
      select: { id: true },
    });
    if (!product) return fail('NOT_FOUND', 'Product not found.');
    return ok(await listCustomPrices({ productId }, [{ customer: { name: 'asc' } }], parsed.data));
  } catch (error) {
    return failed('Error fetching product custom prices:', error, 'Failed to fetch custom prices.');
  }
}

export async function createCustomPrice(
  actor: ActingFreelancer,
  input: CustomPriceSchemaValues,
): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = customPriceSchema.safeParse(input);
    if (!parsed.success) return zodValidationFailure(parsed.error);
    const { customerId, productId, name, price, notes } = parsed.data;

    const [customer, product] = await Promise.all([
      prisma.customer.findFirst({ where: { id: customerId, userId: actor.userId }, select: { id: true } }),
      prisma.product.findFirst({ where: { id: productId, userId: actor.userId }, select: { id: true } }),
    ]);
    if (!customer || !product) return fail('NOT_FOUND', NOT_FOUND_MESSAGE);

    const created = await prisma.customPrice.create({
      data: { customerId, productId, name, price, notes },
      select: { id: true },
    });
    return ok({ id: created.id });
  } catch (error) {
    return failed('Error creating custom price:', error, 'Failed to create custom price.');
  }
}

export async function updateCustomPrice(
  actor: ActingFreelancer,
  id: string,
  input: UpdateCustomPriceValues,
): Promise<ActionResult<{ customerId: string; productId: string }>> {
  try {
    const parsed = updateCustomPriceSchema.safeParse(input);
    if (!parsed.success) return zodValidationFailure(parsed.error);
    const { name, price, notes } = parsed.data;

    const updated = await notFoundOnMiss(
      prisma.customPrice.update({
        where: {
          id,
          customer: { userId: actor.userId },
          product: { userId: actor.userId },
        },
        data: { name, price, notes },
        select: { customerId: true, productId: true },
      }),
      NOT_FOUND_MESSAGE,
    );
    if ('success' in updated) return updated;
    return ok({ customerId: updated.customerId, productId: updated.productId });
  } catch (error) {
    return failed('Error updating custom price:', error, 'Failed to update custom price.');
  }
}

export async function deleteCustomPrice(
  actor: ActingFreelancer,
  id: string,
  customerId: string,
): Promise<ActionResult<{ customerId: string; productId: string }>> {
  try {
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, userId: actor.userId },
      select: { id: true },
    });
    if (!customer) return fail('NOT_FOUND', 'Customer not found.');

    const deleted = await notFoundOnMiss(
      prisma.customPrice.delete({
        where: { id, customerId, customer: { userId: actor.userId } },
        select: { customerId: true, productId: true },
      }),
      'Custom price not found.',
    );
    if ('success' in deleted) return deleted;
    return ok({ customerId: deleted.customerId, productId: deleted.productId });
  } catch (error) {
    return failed('Error deleting custom price:', error, 'Failed to delete custom price.');
  }
}
