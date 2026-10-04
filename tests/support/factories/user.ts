// Freelancer factory (test-plan.md §Test data). "Freelancer" is the product name for a User row
// that owns sender profiles, customers, products and invoices - see data-model.md §Entities.

import type { PrismaClient, User } from '@prisma/client';
import { uniqueTestEmail } from './ids';

export type FreelancerOverrides = Partial<
  Pick<
    User,
    | 'id'
    | 'name'
    | 'email'
    | 'emailVerified'
    | 'image'
    | 'timeZone'
    | 'overdueNoticeDismissedAt'
  >
>;

export async function createFreelancer(
  prisma: PrismaClient,
  overrides: FreelancerOverrides = {}
): Promise<User> {
  return prisma.user.create({
    data: {
      name: overrides.name ?? 'Test Freelancer',
      email: overrides.email ?? uniqueTestEmail('freelancer'),
      emailVerified: overrides.emailVerified ?? new Date(),
      image: overrides.image ?? null,
      timeZone: overrides.timeZone ?? null,
      overdueNoticeDismissedAt: overrides.overdueNoticeDismissedAt ?? null,
      ...(overrides.id ? { id: overrides.id } : {}),
    },
  });
}
