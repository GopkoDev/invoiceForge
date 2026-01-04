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
import { ActionResult } from '@/types/actions';

export async function createSenderProfile(
  data: SenderProfileFormValues
): Promise<ActionResult<SenderProfile>> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success || !authResult.data) {
      return { success: false, error: authResult.error };
    }

    const { userId } = authResult.data;
    const validatedData = senderProfileFormSchema.parse(data);
    const { invoicePrefix, isDefault } = validatedData;

    const existingPrefix = await prisma.senderProfile.findUnique({
      where: { invoicePrefix: invoicePrefix },
    });

    if (existingPrefix) {
      return {
        success: false,
        error:
          'This invoice prefix is already in use. Please choose another one.',
      };
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

    return {
      success: true,
      data: senderProfile,
    };
  } catch (error) {
    console.error('Error creating sender profile:', error);

    return {
      success: false,
      error: 'Failed to create sender profile. Please try again.',
    };
  }
}

export async function updateSenderProfile(
  id: string,
  data: SenderProfileFormValues
): Promise<ActionResult<SenderProfile>> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success || !authResult.data) {
      return { success: false, error: authResult.error };
    }

    const { userId } = authResult.data;
    const validatedData = senderProfileFormSchema.parse(data);

    const existingProfile = await prisma.senderProfile.findUnique({
      where: { id },
    });

    if (!existingProfile || existingProfile.userId !== userId) {
      return {
        success: false,
        error: 'Sender profile not found or access denied.',
      };
    }

    if (validatedData.invoicePrefix !== existingProfile.invoicePrefix) {
      const existingPrefix = await prisma.senderProfile.findUnique({
        where: { invoicePrefix: validatedData.invoicePrefix },
      });

      if (existingPrefix && existingPrefix.id !== id) {
        return {
          success: false,
          error:
            'This invoice prefix is already in use. Please choose another one.',
        };
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

    return {
      success: true,
      data: updatedProfile,
    };
  } catch (error) {
    console.error('Error updating sender profile:', error);

    return {
      success: false,
      error: 'Failed to update sender profile. Please try again.',
    };
  }
}

export async function deleteSenderProfile(id: string): Promise<ActionResult> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success || !authResult.data) {
      return { success: false, error: authResult.error };
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
      return {
        success: false,
        error: 'Sender profile not found or access denied.',
      };
    }

    if (existingProfile._count.invoices > 0) {
      return {
        success: false,
        error:
          'Cannot delete sender profile with existing invoices. Please delete or reassign invoices first.',
      };
    }

    // Delete sender profile (cascade will delete bank accounts)
    await prisma.senderProfile.delete({
      where: { id },
    });

    revalidatePath(protectedRoutes.senderProfiles);

    return {
      success: true,
    };
  } catch (error) {
    console.error('Error deleting sender profile:', error);

    return {
      success: false,
      error: 'Failed to delete sender profile. Please try again.',
    };
  }
}

export async function getSenderProfiles(): Promise<
  ActionResult<SenderProfileWithRelations[]>
> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success || !authResult.data) {
      return { success: false, error: authResult.error };
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

    return {
      success: true,
      data: profiles,
    };
  } catch (error) {
    console.error('Error fetching sender profiles:', error);

    return {
      success: false,
      error: 'Failed to fetch sender profiles. Please try again.',
    };
  }
}

export async function getSenderProfile(
  id: string
): Promise<ActionResult<SenderProfileWithRelations>> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success || !authResult.data) {
      return { success: false, error: authResult.error };
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
      return {
        success: false,
        error: 'Sender profile not found or access denied.',
      };
    }

    return {
      success: true,
      data: profile,
    };
  } catch (error) {
    console.error('Error fetching sender profile:', error);

    return {
      success: false,
      error: 'Failed to fetch sender profile. Please try again.',
    };
  }
}
