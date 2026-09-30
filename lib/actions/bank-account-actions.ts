'use server';

import { prisma } from '@/prisma';
import { getAuthenticatedUser } from '@/lib/helpers/auth-helpers';
import {
  bankAccountFormSchema,
  BankAccountFormValues,
} from '@/lib/validations/bank-account';
import { revalidatePath } from 'next/cache';
import { protectedRoutes } from '@/config/routes.config';
import { BankAccountWithRelations } from '@/types/sender-profile/types';
import { ActionResult, ok, fail } from '@/types/actions';
import { BankAccount } from '@prisma/client';
import { z } from 'zod';
import { failed, zodValidationFailure } from '@/lib/actions/action-result-helpers';

export async function createBankAccount(
  senderProfileId: string,
  data: BankAccountFormValues
): Promise<ActionResult<BankAccount>> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success) {
      return authResult;
    }

    const { userId } = authResult.data;
    const validatedData = bankAccountFormSchema.parse(data);

    const senderProfile = await prisma.senderProfile.findUnique({
      where: { id: senderProfileId },
    });

    if (!senderProfile || senderProfile.userId !== userId) {
      return fail('NOT_FOUND', 'Sender profile not found.');
    }

    if (validatedData.isDefault) {
      await prisma.bankAccount.updateMany({
        where: { senderProfileId },
        data: { isDefault: false },
      });
    }

    const bankAccount = await prisma.bankAccount.create({
      data: {
        senderProfileId,
        ...validatedData,
      },
    });

    revalidatePath(protectedRoutes.senderProfiles);
    revalidatePath(protectedRoutes.senderProfileEdit(senderProfileId));
    revalidatePath(
      protectedRoutes.senderProfileEditBankAccounts(senderProfileId)
    );

    return ok(bankAccount);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return zodValidationFailure(error);
    }
    return failed('Error creating bank account:', error, 'Failed to create bank account. Please try again.');
  }
}

export async function updateBankAccount(
  id: string,
  data: BankAccountFormValues
): Promise<ActionResult<BankAccount>> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success) {
      return authResult;
    }

    const { userId } = authResult.data;
    const validatedData = bankAccountFormSchema.parse(data);

    const existingAccount = await prisma.bankAccount.findUnique({
      where: { id },
      include: {
        senderProfile: true,
      },
    });

    if (!existingAccount || existingAccount.senderProfile.userId !== userId) {
      return fail('NOT_FOUND', 'Bank account not found.');
    }

    if (validatedData.isDefault && !existingAccount.isDefault) {
      await prisma.bankAccount.updateMany({
        where: {
          senderProfileId: existingAccount.senderProfileId,
          id: { not: id },
        },
        data: { isDefault: false },
      });
    }

    const updatedAccount = await prisma.bankAccount.update({
      where: { id },
      data: {
        ...validatedData,
      },
    });

    revalidatePath(protectedRoutes.senderProfiles);
    revalidatePath(
      protectedRoutes.senderProfileEdit(existingAccount.senderProfileId)
    );
    revalidatePath(
      protectedRoutes.senderProfileEditBankAccounts(
        existingAccount.senderProfileId
      )
    );

    return ok(updatedAccount);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return zodValidationFailure(error);
    }
    return failed('Error updating bank account:', error, 'Failed to update bank account. Please try again.');
  }
}

export async function deleteBankAccount(id: string): Promise<ActionResult> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success) {
      return authResult;
    }

    const { userId } = authResult.data;

    const existingAccount = await prisma.bankAccount.findUnique({
      where: { id },
      include: {
        senderProfile: true,
        invoices: { take: 1 },
      },
    });

    if (!existingAccount || existingAccount.senderProfile.userId !== userId) {
      return fail('NOT_FOUND', 'Bank account not found.');
    }

    if (existingAccount.invoices.length > 0) {
      return fail(
        'CONFLICT',
        'Cannot delete bank account with existing invoices. Please delete or reassign invoices first.',
      );
    }

    const senderProfileId = existingAccount.senderProfileId;

    await prisma.bankAccount.delete({
      where: { id },
    });

    revalidatePath(protectedRoutes.senderProfiles);
    revalidatePath(protectedRoutes.senderProfileEdit(senderProfileId));
    revalidatePath(
      protectedRoutes.senderProfileEditBankAccounts(senderProfileId)
    );

    return ok();
  } catch (error) {
    return failed('Error deleting bank account:', error, 'Failed to delete bank account. Please try again.');
  }
}

export async function getBankAccounts(
  senderProfileId: string,
  limit?: number
): Promise<ActionResult<BankAccountWithRelations[]>> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success) {
      return authResult;
    }

    const { userId } = authResult.data;

    const senderProfile = await prisma.senderProfile.findUnique({
      where: { id: senderProfileId },
    });

    if (!senderProfile || senderProfile.userId !== userId) {
      return fail('NOT_FOUND', 'Sender profile not found.');
    }

    const bankAccounts = await prisma.bankAccount.findMany({
      where: { senderProfileId },
      include: {
        _count: {
          select: {
            invoices: true,
          },
        },
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      ...(limit && { take: limit }),
    });

    return ok(bankAccounts);
  } catch (error) {
    return failed('Error fetching bank accounts:', error, 'Failed to fetch bank accounts. Please try again.');
  }
}
