'use server';

import { prisma } from '@/prisma';
import { getAuthenticatedUser } from '@/lib/helpers/auth-helpers';
import { ActionResult } from '@/types/actions';

export interface SetupCheckResult {
  hasSenderProfiles: boolean;
  hasBankAccounts: boolean;
  hasCustomers: boolean;
  hasProducts: boolean;
  isComplete: boolean;
}

export async function checkDashboardSetup(): Promise<
  ActionResult<SetupCheckResult>
> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success || !authResult.data) {
      return { success: false, error: authResult.error };
    }

    const { userId } = authResult.data;

    const [senderProfileCount, bankAccountCount, customerCount, productCount] =
      await Promise.all([
        prisma.senderProfile.count({ where: { userId } }),
        prisma.bankAccount.count({
          where: { senderProfile: { userId } },
        }),
        prisma.customer.count({ where: { userId } }),
        prisma.product.count({ where: { userId } }),
      ]);

    const hasSenderProfiles = senderProfileCount > 0;
    const hasBankAccounts = bankAccountCount > 0;
    const hasCustomers = customerCount > 0;
    const hasProducts = productCount > 0;

    return {
      success: true,
      data: {
        hasSenderProfiles,
        hasBankAccounts,
        hasCustomers,
        hasProducts,
        isComplete: hasSenderProfiles && hasBankAccounts && hasCustomers,
      },
    };
  } catch (error) {
    console.error('Error checking dashboard setup:', error);
    return { success: false, error: 'Failed to check setup status' };
  }
}
