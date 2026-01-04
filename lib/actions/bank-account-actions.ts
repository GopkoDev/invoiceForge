'use server';

import { auth } from '@/auth';
import { prisma } from '@/prisma';
import {
  bankAccountFormSchema,
  BankAccountFormValues,
} from '@/lib/validations/bank-account';
import { revalidatePath } from 'next/cache';
import { protectedRoutes } from '@/config/routes.config';
import { BankAccountWithRelations } from '@/types/sender-profile/types';
import { ActionResult } from '@/types/actions';
import { BankAccount } from '@prisma/client';

export async function createBankAccount(
  senderProfileId: string,
  data: BankAccountFormValues
): Promise<ActionResult<BankAccount>> {
  try {
    const validatedData = bankAccountFormSchema.parse(data);

    const session = await auth();
    if (!session?.user?.id) {
      return {
        success: false,
        error: 'Unauthorized. Please login to continue.',
      };
    }

    const userId = session.user.id;

    const senderProfile = await prisma.senderProfile.findUnique({
      where: { id: senderProfileId },
    });

    if (!senderProfile || senderProfile.userId !== userId) {
      return {
        success: false,
        error: 'Sender profile not found or access denied.',
      };
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

    return {
      success: true,
      data: bankAccount,
    };
  } catch (error) {
    console.error('Error creating bank account:', error);

    return {
      success: false,
      error: 'Failed to create bank account. Please try again.',
    };
  }
}

export async function updateBankAccount(
  id: string,
  data: BankAccountFormValues
): Promise<ActionResult<BankAccount>> {
  try {
    const validatedData = bankAccountFormSchema.parse(data);

    const session = await auth();
    if (!session?.user?.id) {
      return {
        success: false,
        error: 'Unauthorized. Please login to continue.',
      };
    }

    const userId = session.user.id;

    const existingAccount = await prisma.bankAccount.findUnique({
      where: { id },
      include: {
        senderProfile: true,
      },
    });

    if (!existingAccount || existingAccount.senderProfile.userId !== userId) {
      return {
        success: false,
        error: 'Bank account not found or access denied.',
      };
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

    return {
      success: true,
      data: updatedAccount,
    };
  } catch (error) {
    console.error('Error updating bank account:', error);

    return {
      success: false,
      error: 'Failed to update bank account. Please try again.',
    };
  }
}

export async function deleteBankAccount(id: string): Promise<ActionResult> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return {
        success: false,
        error: 'Unauthorized. Please login to continue.',
      };
    }

    const userId = session.user.id;

    const existingAccount = await prisma.bankAccount.findUnique({
      where: { id },
      include: {
        senderProfile: true,
        invoices: { take: 1 },
      },
    });

    if (!existingAccount || existingAccount.senderProfile.userId !== userId) {
      return {
        success: false,
        error: 'Bank account not found or access denied.',
      };
    }

    if (existingAccount.invoices.length > 0) {
      return {
        success: false,
        error:
          'Cannot delete bank account with existing invoices. Please delete or reassign invoices first.',
      };
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

    return {
      success: true,
    };
  } catch (error) {
    console.error('Error deleting bank account:', error);

    return {
      success: false,
      error: 'Failed to delete bank account. Please try again.',
    };
  }
}

export async function getBankAccounts(
  senderProfileId: string,
  limit?: number
): Promise<ActionResult<BankAccountWithRelations[]>> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return {
        success: false,
        error: 'Unauthorized. Please login to continue.',
      };
    }

    const userId = session.user.id;

    const senderProfile = await prisma.senderProfile.findUnique({
      where: { id: senderProfileId },
    });

    if (!senderProfile || senderProfile.userId !== userId) {
      return {
        success: false,
        error: 'Sender profile not found or access denied.',
      };
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

    return {
      success: true,
      data: bankAccounts,
    };
  } catch (error) {
    console.error('Error fetching bank accounts:', error);

    return {
      success: false,
      error: 'Failed to fetch bank accounts. Please try again.',
    };
  }
}
