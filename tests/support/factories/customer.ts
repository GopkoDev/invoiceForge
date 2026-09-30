import type { Customer, Currency, PrismaClient } from '@prisma/client';
import { uniqueTestEmail } from './ids';

export type CustomerOverrides = Partial<
  Omit<Customer, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
> & { id?: string };

export async function createCustomer(
  prisma: PrismaClient,
  userId: string,
  overrides: CustomerOverrides = {}
): Promise<Customer> {
  return prisma.customer.create({
    data: {
      userId,
      name: overrides.name ?? 'Test Customer',
      companyName: overrides.companyName,
      taxId: overrides.taxId,
      email: overrides.email ?? uniqueTestEmail('customer'),
      phone: overrides.phone,
      website: overrides.website,
      image: overrides.image,
      address: overrides.address,
      city: overrides.city,
      country: overrides.country,
      postalCode: overrides.postalCode,
      defaultCurrency: (overrides.defaultCurrency ?? 'USD') as Currency,
      notes: overrides.notes,
      ...(overrides.id ? { id: overrides.id } : {}),
    },
  });
}
