'use server';

import { prisma } from '@/prisma';
import { getAuthenticatedUser } from '@/lib/helpers/auth-helpers';
import {
  senderProfileFormSchema,
  SenderProfileFormValues,
} from '@/lib/validations/sender-profile';
import { revalidatePath } from 'next/cache';
import { protectedRoutes } from '@/config/routes.config';
import { SenderProfileWithRelations } from '@/types/sender-profile/types';
import { SenderProfile } from '@prisma/client';
import { ActionResult, ok, fail } from '@/types/actions';
import { z } from 'zod';
import {
  zodValidationFailure,
  hasInvoicesConflict,
  isRestrictForeignKeyError,
} from '@/lib/actions/action-result-helpers';

export async function createSenderProfile(
  data: SenderProfileFormValues
): Promise<ActionResult<SenderProfile>> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success) {
      return authResult;
    }

    const { userId } = authResult.data;
    const validatedData = senderProfileFormSchema.parse(data);
    const { invoicePrefix, isDefault } = validatedData;

    const existingPrefix = await prisma.senderProfile.findUnique({
      where: { invoicePrefix: invoicePrefix },
    });

    if (existingPrefix) {
      return fail(
        'CONFLICT',
        'This invoice prefix is already in use. Please choose another one.',
      );
    }

    if (isDefault) {
      await prisma.senderProfile.updateMany({
        where: { userId },
        data: { isDefault: false },
      });
    }

    const senderProfile = await prisma.senderProfile.create({
      data: {
        userId,
        ...validatedData,
      },
    });

    revalidatePath(protectedRoutes.senderProfiles);

    return ok(senderProfile);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return zodValidationFailure(error);
    }
    console.error('Error creating sender profile:', error);

    return fail('FAILED', 'Failed to create sender profile. Please try again.');
  }
}

export async function updateSenderProfile(
  id: string,
  data: SenderProfileFormValues
): Promise<ActionResult<SenderProfile>> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success) {
      return authResult;
    }

    const { userId } = authResult.data;
    const validatedData = senderProfileFormSchema.parse(data);

    const existingProfile = await prisma.senderProfile.findUnique({
      where: { id },
    });

    if (!existingProfile || existingProfile.userId !== userId) {
      return fail('NOT_FOUND', 'Sender profile not found.');
    }

    if (validatedData.invoicePrefix !== existingProfile.invoicePrefix) {
      const existingPrefix = await prisma.senderProfile.findUnique({
        where: { invoicePrefix: validatedData.invoicePrefix },
      });

      if (existingPrefix && existingPrefix.id !== id) {
        return fail(
          'CONFLICT',
          'This invoice prefix is already in use. Please choose another one.',
        );
      }
    }

    if (validatedData.isDefault && !existingProfile.isDefault) {
      await prisma.senderProfile.updateMany({
        where: {
          userId,
          id: { not: id },
        },
        data: { isDefault: false },
      });
    }

    const updatedProfile = await prisma.senderProfile.update({
      where: { id },
      data: {
        ...validatedData,
      },
    });

    revalidatePath(protectedRoutes.senderProfiles);

    return ok(updatedProfile);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return zodValidationFailure(error);
    }
    console.error('Error updating sender profile:', error);

    return fail('FAILED', 'Failed to update sender profile. Please try again.');
  }
}

export async function deleteSenderProfile(id: string): Promise<ActionResult> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success) {
      return authResult;
    }

    const { userId } = authResult.data;

    const existingProfile = await prisma.senderProfile.findUnique({
      where: { id },
      include: {
        _count: {
          select: { invoices: true },
        },
      },
    });

    if (!existingProfile || existingProfile.userId !== userId) {
      return fail('NOT_FOUND', 'Sender profile not found.');
    }

    if (existingProfile._count.invoices > 0) {
      return hasInvoicesConflict('sender profile', existingProfile._count.invoices);
    }

    try {
      // Delete sender profile (cascade will delete bank accounts)
      await prisma.senderProfile.delete({
        where: { id },
      });
    } catch (deleteError) {
      if (isRestrictForeignKeyError(deleteError)) {
        // An invoice was saved between the count above and this delete (Restrict FK, P2003):
        // recount and report the same CONFLICT, never FAILED (sad.md §8 Hard rule, AC-22).
        const invoiceCount = await prisma.invoice.count({ where: { senderProfileId: id } });
        return hasInvoicesConflict('sender profile', invoiceCount);
      }
      throw deleteError;
    }

    revalidatePath(protectedRoutes.senderProfiles);

    return ok();
  } catch (error) {
    console.error('Error deleting sender profile:', error);

    return fail('FAILED', 'Failed to delete sender profile. Please try again.');
  }
}

export async function getSenderProfiles(): Promise<
  ActionResult<SenderProfileWithRelations[]>
> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success) {
      return authResult;
    }

    const { userId } = authResult.data;

    const profiles = await prisma.senderProfile.findMany({
      where: { userId },
      include: {
        _count: {
          select: {
            invoices: true,
            bankAccounts: true,
          },
        },
      },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });

    return ok(profiles);
  } catch (error) {
    console.error('Error fetching sender profiles:', error);

    return fail('FAILED', 'Failed to fetch sender profiles. Please try again.');
  }
}

export async function getSenderProfile(
  id: string
): Promise<ActionResult<SenderProfileWithRelations>> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success) {
      return authResult;
    }

    const { userId } = authResult.data;

    const profile = await prisma.senderProfile.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            invoices: true,
            bankAccounts: true,
          },
        },
      },
    });

    if (!profile || profile.userId !== userId) {
      return fail('NOT_FOUND', 'Sender profile not found.');
    }

    return ok(profile);
  } catch (error) {
    console.error('Error fetching sender profile:', error);

    return fail('FAILED', 'Failed to fetch sender profile. Please try again.');
  }
}
