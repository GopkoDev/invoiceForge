'use server';

import { auth } from '@/auth';
import { prisma } from '@/prisma';
import {
  senderProfileFormSchema,
  SenderProfileFormValues,
} from '@/lib/validations/sender-profile';
import { revalidatePath } from 'next/cache';
import { protectedRoutes } from '@/config/routes.config';

export async function createSenderProfile(data: SenderProfileFormValues) {
  try {
    const validatedData = senderProfileFormSchema.parse(data);
    const { invoicePrefix, isDefault } = validatedData;

    const session = await auth();
    if (!session?.user?.id) {
      return {
        success: false,
        error: 'Unauthorized. Please login to continue.',
      };
    }

    const userId = session.user.id;

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
) {
  try {
    const validatedData = senderProfileFormSchema.parse(data);

    const session = await auth();
    if (!session?.user?.id) {
      return {
        success: false,
        error: 'Unauthorized. Please login to continue.',
      };
    }

    const userId = session.user.id;

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

export async function deleteSenderProfile(id: string) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return {
        success: false,
        error: 'Unauthorized. Please login to continue.',
      };
    }

    const userId = session.user.id;

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

export async function getSenderProfiles() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return {
        success: false,
        error: 'Unauthorized. Please login to continue.',
        data: [],
      };
    }

    const userId = session.user.id;

    const profiles = await prisma.senderProfile.findMany({
      where: { userId },
      include: {
        bankAccounts: true,
        _count: {
          select: {
            invoices: true,
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
      data: [],
    };
  }
}

export async function getSenderProfile(id: string) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return {
        success: false,
        error: 'Unauthorized. Please login to continue.',
        data: null,
      };
    }

    const userId = session.user.id;

    const profile = await prisma.senderProfile.findUnique({
      where: { id },
      include: {
        bankAccounts: true,
      },
    });

    if (!profile || profile.userId !== userId) {
      return {
        success: false,
        error: 'Sender profile not found or access denied.',
        data: null,
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
      data: null,
    };
  }
}
