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
  failed,
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
    const parsed = senderProfileFormSchema.safeParse(data);
    if (!parsed.success) {
      return zodValidationFailure(parsed.error);
    }
    const validatedData = parsed.data;
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
    return failed('Error creating sender profile:', error, 'Failed to create sender profile. Please try again.');
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
    const parsed = senderProfileFormSchema.safeParse(data);
    if (!parsed.success) {
      return zodValidationFailure(parsed.error);
    }
    const validatedData = parsed.data;

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
    return failed('Error updating sender profile:', error, 'Failed to update sender profile. Please try again.');
  }
}

/** F-43: counts invoices that would Restrict-block deleting this sender profile, whether they
 * reference it directly (invoice.senderProfileId) or through one of its bank accounts
 * (invoice.bankAccountId) — both FKs are Restrict onto rows this delete's cascade removes. */
async function countSenderProfileInvoices(senderProfileId: string): Promise<number> {
  return prisma.invoice.count({
    where: {
      OR: [
        { senderProfileId },
        { bankAccount: { senderProfileId } },
      ],
    },
  });
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
    });

    if (!existingProfile || existingProfile.userId !== userId) {
      return fail('NOT_FOUND', 'Sender profile not found.');
    }

    // F-43: an invoice can be Restrict-blocked from either the profile's own senderProfileId OR
    // (data saved before verifyInvoiceRelations tied a bank account to its specific profile,
    // helpers.ts) one of its bank accounts' bankAccountId — counting only senderProfileId missed
    // those and reported CONFLICT with count 0.
    const invoiceCount = await countSenderProfileInvoices(id);

    if (invoiceCount > 0) {
      return hasInvoicesConflict('sender profile', invoiceCount);
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
        const recount = await countSenderProfileInvoices(id);
        return hasInvoicesConflict('sender profile', recount);
      }
      throw deleteError;
    }

    revalidatePath(protectedRoutes.senderProfiles);

    return ok();
  } catch (error) {
    return failed('Error deleting sender profile:', error, 'Failed to delete sender profile. Please try again.');
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
    return failed('Error fetching sender profiles:', error, 'Failed to fetch sender profiles. Please try again.');
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
    return failed('Error fetching sender profile:', error, 'Failed to fetch sender profile. Please try again.');
  }
}
