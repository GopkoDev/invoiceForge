'use server';

import { auth } from '@/auth';
import { prisma } from '@/prisma';
import {
  profileFormSchema,
  ProfileFormValues,
} from '@/lib/validations/profile';

export async function updateProfile(data: ProfileFormValues) {
  try {
    const validatedData = profileFormSchema.parse(data);

    // Profile actions need full session for email
    const session = await auth();
    if (!session?.user?.id || !session?.user?.email) {
      return {
        success: false,
        error: 'Unauthorized. Please login to continue.',
      };
    }

    const userId = session.user.id;
    const currentEmail = session.user.email;
    const isEmailChanged = validatedData.email !== currentEmail;

    if (isEmailChanged) {
      const existingUser = await prisma.user.findUnique({
        where: { email: validatedData.email },
      });

      if (existingUser && existingUser.id !== userId) {
        return {
          success: false,
          error: 'This email is already in use by another account.',
        };
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          name: validatedData.name,
          email: validatedData.email,
          image:
            validatedData.image && validatedData.image !== ''
              ? validatedData.image
              : null,
        },
      });

      if (isEmailChanged && currentEmail) {
        await tx.emailHistory.create({
          data: {
            userId: userId,
            oldEmail: currentEmail,
            newEmail: validatedData.email,
            reason: 'User changed email via profile settings',
          },
        });
      }
    });

    return {
      success: true,
      emailChanged: isEmailChanged,
    };
  } catch (error) {
    console.error('Error updating profile:', error);

    return {
      success: false,
      error: 'Failed to update profile. Please try again.',
    };
  }
}
