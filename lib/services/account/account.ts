import 'server-only';
import { captureException } from '@sentry/nextjs';
import { prisma } from '@/prisma';
import { redactError } from '@/lib/helpers/prisma-error-scrub';
import { fail, ok, type ActionResult } from '@/types/result';
import type { ActingFreelancer } from '@/lib/services/_shared/acting-freelancer';

const ACCOUNT_NOT_FOUND = 'Account not found.';

/**
 * Counts the invoices that will be permanently lost if the account is deleted
 * (spec.md §5, AC-20), across every sender profile the Freelancer owns.
 */
export async function getAccountDeletionSummary(
  actor: ActingFreelancer,
): Promise<ActionResult<{ invoiceCount: number }>> {
  try {
    const invoiceCount = await prisma.invoice.count({
      where: { senderProfile: { userId: actor.userId } },
    });
    return ok({ invoiceCount });
  } catch (error) {
    console.error('Error counting invoices for account deletion:', redactError(error));
    captureException(error);
    return fail('FAILED', 'Something went wrong. Please try again.');
  }
}

/**
 * Deletes the account and every row it owns in one explicit transaction (adr/0007).
 * Invoices (and their items, by cascade) go first so the Restrict FKs never trip when
 * User cascades; VerificationToken rows for the account's email go too. Any failure
 * rolls back everything (AC-20). Only a session-verified wrapper may call this (spec §6.1).
 */
export async function deleteAccount(actor: ActingFreelancer): Promise<ActionResult<void>> {
  const { userId } = actor;
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!user) return fail('NOT_FOUND', ACCOUNT_NOT_FOUND);

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

async function readExport(userId: string) {
  const [user, accounts, emailHistory, senderProfiles, customers, products, invoices] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          emailVerified: true,
          image: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.account.findMany({
        where: { userId },
        select: { provider: true, type: true, createdAt: true },
      }),
      prisma.emailHistory.findMany({ where: { userId } }),
      prisma.senderProfile.findMany({
        where: { userId },
        include: { bankAccounts: true },
      }),
      prisma.customer.findMany({
        where: { userId },
        include: {
          customPrices: {
            include: { product: { select: { name: true, unit: true } } },
          },
        },
      }),
      prisma.product.findMany({
        where: { userId },
        include: {
          customPrices: {
            include: { customer: { select: { name: true } } },
          },
        },
      }),
      prisma.invoice.findMany({
        where: { senderProfile: { userId } },
        include: { items: true },
      }),
    ]);
  return { user, accounts, emailHistory, senderProfiles, customers, products, invoices };
}

type ExportRead = Awaited<ReturnType<typeof readExport>>;

export type AccountExport = Omit<ExportRead, 'user'> & {
  exportDate: string;
  exportVersion: '2.0';
  user: NonNullable<ExportRead['user']>;
};

/** Every category the account owns, scoped by actor.userId (exportVersion 2.0, Session dropped). */
export async function getAccountExport(actor: ActingFreelancer): Promise<ActionResult<AccountExport>> {
  try {
    const { user, ...rest } = await readExport(actor.userId);
    if (!user) return fail('NOT_FOUND', ACCOUNT_NOT_FOUND);

    return ok({
      exportDate: new Date().toISOString(),
      exportVersion: '2.0',
      user,
      ...rest,
    });
  } catch (error) {
    console.error('Error exporting user data:', redactError(error));
    captureException(error);
    return fail('FAILED', "Your data couldn't be exported. Try again.");
  }
}
