'use server';

import { prisma } from '@/prisma';
import { getAuthenticatedUser } from '@/lib/helpers/auth-helpers';
import { redactError } from '@/lib/helpers/prisma-error-scrub';
import { ActionResult, ok, fail } from '@/types/actions';
import { captureException } from '@sentry/nextjs';

/**
 * Counts the invoices that will be permanently lost if the caller deletes their account
 * (spec.md §5, AC-20). Scoped by senderProfile.userId, across every sender profile the
 * Freelancer owns.
 */
export async function getAccountDeletionSummary(): Promise<
  ActionResult<{ invoiceCount: number }>
> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success) {
      return authResult;
    }

    const { userId } = authResult.data;

    const invoiceCount = await prisma.invoice.count({
      where: { senderProfile: { userId } },
    });

    return ok({ invoiceCount });
  } catch (error) {
    console.error('Error counting invoices for account deletion:', redactError(error));
    captureException(error);
    return fail('FAILED', 'Something went wrong. Please try again.');
  }
}

/**
 * Deletes the caller's account and every row it owns in one explicit transaction
 * (adr/0007). Invoices (and their items, by cascade) are deleted first so the Restrict
 * FKs on Invoice.senderProfile/customer/bankAccount never trip when User cascades into
 * SenderProfile, BankAccount, Customer and Product. VerificationToken rows for the
 * account's email are deleted too (breakdown decision, OQ-2). Any failure rolls back the
 * whole transaction — either everything is removed or nothing is (AC-20).
 */
export async function deleteUserAccount(): Promise<ActionResult<void>> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success) {
      return authResult;
    }

    const { userId } = authResult.data;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    if (!user) {
      return fail('UNAUTHORIZED', 'Not signed in.');
    }

    await prisma.$transaction([
      prisma.invoice.deleteMany({ where: { senderProfile: { userId } } }),
      prisma.verificationToken.deleteMany({ where: { identifier: user.email } }),
      prisma.user.delete({ where: { id: userId } }),
    ]);

    return ok();
  } catch (error) {
    console.error('Error deleting user account:', redactError(error));
    captureException(error);
    return fail('FAILED', "Your account couldn't be deleted. Nothing was removed.");
  }
}
