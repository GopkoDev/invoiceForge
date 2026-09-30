import type { Currency, PrismaClient, Product } from '@prisma/client';

export type ProductOverrides = Partial<
  Omit<Product, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'price'>
> & { id?: string; price?: number };

export async function createProduct(
  prisma: PrismaClient,
  userId: string,
  overrides: ProductOverrides = {}
): Promise<Product> {
  return prisma.product.create({
    data: {
      userId,
      name: overrides.name ?? 'Test Product',
      description: overrides.description,
      unit: overrides.unit ?? 'pcs',
      price: overrides.price ?? 100,
      currency: (overrides.currency ?? 'USD') as Currency,
      isActive: overrides.isActive ?? true,
      ...(overrides.id ? { id: overrides.id } : {}),
    },
  });
}
