import 'server-only';
import type { BankAccount } from '@prisma/client';
import { prisma } from '@/prisma';
import { bankAccountFormSchema, type BankAccountFormValues } from '@/lib/validations/bank-account';
import type { BankAccountWithRelations } from '@/types/sender-profile/types';
import { fail, ok, type ActionResult } from '@/types/result';
import { failed, zodValidationFailure } from '@/lib/services/_shared/result-helpers';
import { notFoundOnMiss } from '@/lib/services/_shared/owner-scope';
import { ilikeAny, paginate, parseListQuery, type ListQuery, type Page } from '@/lib/services/_shared/list-query';
import type { ActingFreelancer } from '@/lib/services/_shared/acting-freelancer';

const PROFILE_NOT_FOUND = 'Sender profile not found.';
const ACCOUNT_NOT_FOUND = 'Bank account not found.';

export async function listBankAccounts(
  actor: ActingFreelancer,
  senderProfileId: string,
  query?: ListQuery,
): Promise<ActionResult<Page<BankAccountWithRelations>>> {
  try {
    const parsed = parseListQuery(query);
    if (!parsed.success) return parsed;

    const profile = await prisma.senderProfile.findFirst({
      where: { id: senderProfileId, userId: actor.userId },
      select: { id: true },
    });
    if (!profile) return fail('NOT_FOUND', PROFILE_NOT_FOUND);

    // Account number and IBAN are deliberately not searchable.
    const where = {
      senderProfileId,
      ...ilikeAny(['bankName', 'accountName'], parsed.data.search ?? ''),
    };

    const page = await paginate({
      query: parsed.data,
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      count: () => prisma.bankAccount.count({ where }),
      findMany: ({ skip, take, orderBy }) =>
        prisma.bankAccount.findMany({
          where,
          include: { _count: { select: { invoices: true } } },
          orderBy: orderBy as never,
          skip,
          take,
        }),
    });

    return ok(page);
  } catch (error) {
    return failed('Error fetching bank accounts:', error, 'Failed to fetch bank accounts. Please try again.');
  }
}

export async function createBankAccount(
  actor: ActingFreelancer,
  senderProfileId: string,
  input: BankAccountFormValues,
): Promise<ActionResult<BankAccount>> {
  try {
    const parsed = bankAccountFormSchema.safeParse(input);
    if (!parsed.success) return zodValidationFailure(parsed.error);

    const profile = await prisma.senderProfile.findFirst({
      where: { id: senderProfileId, userId: actor.userId },
      select: { id: true },
    });
    if (!profile) return fail('NOT_FOUND', PROFILE_NOT_FOUND);

    if (parsed.data.isDefault) {
      await prisma.bankAccount.updateMany({
        where: { senderProfileId, senderProfile: { userId: actor.userId } },
        data: { isDefault: false },
      });
    }

    const bankAccount = await prisma.bankAccount.create({
      data: { senderProfileId, ...parsed.data },
    });
    return ok(bankAccount);
  } catch (error) {
    return failed('Error creating bank account:', error, 'Failed to create bank account. Please try again.');
  }
}

export async function updateBankAccount(
  actor: ActingFreelancer,
  id: string,
  input: BankAccountFormValues,
): Promise<ActionResult<BankAccount>> {
  try {
    const parsed = bankAccountFormSchema.safeParse(input);
    if (!parsed.success) return zodValidationFailure(parsed.error);

    const existing = await prisma.bankAccount.findFirst({
      where: { id, senderProfile: { userId: actor.userId } },
    });
    if (!existing) return fail('NOT_FOUND', ACCOUNT_NOT_FOUND);

    if (parsed.data.isDefault && !existing.isDefault) {
      await prisma.bankAccount.updateMany({
        where: {
          senderProfileId: existing.senderProfileId,
          id: { not: id },
          senderProfile: { userId: actor.userId },
        },
        data: { isDefault: false },
      });
    }

    const written = await notFoundOnMiss(
      prisma.bankAccount.update({
        where: { id, senderProfile: { userId: actor.userId } },
        data: parsed.data,
      }),
      ACCOUNT_NOT_FOUND,
    );
    if ('success' in written) return written;
    return ok(written);
  } catch (error) {
    return failed('Error updating bank account:', error, 'Failed to update bank account. Please try again.');
  }
}

export async function deleteBankAccount(
  actor: ActingFreelancer,
  id: string,
): Promise<ActionResult<{ senderProfileId: string }>> {
  try {
    const existing = await prisma.bankAccount.findFirst({
      where: { id, senderProfile: { userId: actor.userId } },
      include: { invoices: { take: 1, select: { id: true } } },
    });
    if (!existing) return fail('NOT_FOUND', ACCOUNT_NOT_FOUND);

    if (existing.invoices.length > 0) {
      return fail(
        'CONFLICT',
        'Cannot delete bank account with existing invoices. Please delete or reassign invoices first.',
      );
    }

    const written = await notFoundOnMiss(
      prisma.bankAccount.delete({ where: { id, senderProfile: { userId: actor.userId } } }),
      ACCOUNT_NOT_FOUND,
    );
    if ('success' in written) return written;
    return ok({ senderProfileId: existing.senderProfileId });
  } catch (error) {
    return failed('Error deleting bank account:', error, 'Failed to delete bank account. Please try again.');
  }
}
