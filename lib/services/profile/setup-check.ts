import 'server-only';
import { prisma } from '@/prisma';
import { ok, type ActionResult } from '@/types/result';
import type { ActingFreelancer } from '@/lib/services/_shared/acting-freelancer';
import { failed } from '@/lib/services/_shared/result-helpers';

export interface SetupCheckResult {
  hasSenderProfiles: boolean;
  hasBankAccounts: boolean;
  hasCustomers: boolean;
  hasProducts: boolean;
  isComplete: boolean;
}

export async function checkSetup(actor: ActingFreelancer): Promise<ActionResult<SetupCheckResult>> {
  const { userId } = actor;
  try {
    const [senderProfileCount, bankAccountCount, customerCount, productCount] =
      await Promise.all([
        prisma.senderProfile.count({ where: { userId } }),
        prisma.bankAccount.count({ where: { senderProfile: { userId } } }),
        prisma.customer.count({ where: { userId } }),
        prisma.product.count({ where: { userId } }),
      ]);

    const hasSenderProfiles = senderProfileCount > 0;
    const hasBankAccounts = bankAccountCount > 0;
    const hasCustomers = customerCount > 0;
    const hasProducts = productCount > 0;

    return ok({
      hasSenderProfiles,
      hasBankAccounts,
      hasCustomers,
      hasProducts,
      isComplete: hasSenderProfiles && hasBankAccounts && hasCustomers,
    });
  } catch (error) {
    return failed('Error checking dashboard setup:', error, 'Failed to check setup status.');
  }
}
