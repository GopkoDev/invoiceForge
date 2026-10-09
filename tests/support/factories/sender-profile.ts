import type { PrismaClient, SenderProfile } from '@prisma/client';
import { uniqueInvoicePrefix } from './ids';

export type SenderProfileOverrides = Partial<
  Omit<SenderProfile, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
> & { id?: string };

export async function createSenderProfile(
  prisma: PrismaClient,
  userId: string,
  overrides: SenderProfileOverrides = {}
): Promise<SenderProfile> {
  return prisma.senderProfile.create({
    data: {
      userId,
      name: overrides.name ?? 'Test Sender Profile',
      // invoicePrefix is @unique across every SenderProfile (test-plan.md §Test data).
      invoicePrefix: overrides.invoicePrefix ?? uniqueInvoicePrefix(),
      invoiceCounter: overrides.invoiceCounter ?? 0,
      // At most one default per Freelancer (partial unique index, ADR-0005): the first profile is.
      isDefault: overrides.isDefault ?? (await prisma.senderProfile.count({ where: { userId } })) === 0,
      legalName: overrides.legalName,
      taxId: overrides.taxId,
      address: overrides.address,
      city: overrides.city,
      country: overrides.country,
      postalCode: overrides.postalCode,
      phone: overrides.phone,
      email: overrides.email,
      website: overrides.website,
      logo: overrides.logo,
      ...(overrides.id ? { id: overrides.id } : {}),
    },
  });
}
