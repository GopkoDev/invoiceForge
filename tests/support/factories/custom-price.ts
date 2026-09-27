import type { CustomPrice, PrismaClient } from '@prisma/client';

export type CustomPriceOverrides = Partial<
  Omit<CustomPrice, 'id' | 'productId' | 'customerId' | 'createdAt' | 'updatedAt'>
> & { id?: string };

export async function createCustomPrice(
  prisma: PrismaClient,
  productId: string,
  customerId: string,
  overrides: CustomPriceOverrides = {}
): Promise<CustomPrice> {
  return prisma.customPrice.create({
    data: {
      productId,
      customerId,
      name: overrides.name,
      price: overrides.price ?? 80,
      notes: overrides.notes,
      ...(overrides.id ? { id: overrides.id } : {}),
    },
  });
}
