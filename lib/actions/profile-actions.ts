'use server';

import { prisma } from '@/prisma';
import { getAuthenticatedUser } from '@/lib/helpers/auth-helpers';
import { failed, zodValidationFailure } from '@/lib/actions/action-result-helpers';
import {
  profileFormSchema,
  ProfileFormValues,
} from '@/lib/validations/profile';
import { ActionResult, ok, fail } from '@/types/actions';

export async function updateProfile(
  data: ProfileFormValues
): Promise<ActionResult<void>> {
  try {
    const authResult = await getAuthenticatedUser();
    if (!authResult.success) {
      return authResult;
    }

    const { userId } = authResult.data;

    const parsed = profileFormSchema.safeParse(data);
    if (!parsed.success) {
      return zodValidationFailure(parsed.error);
    }

    const validatedData = parsed.data;

    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    if (!currentUser) {
      return fail('FAILED', 'Failed to update profile. Please try again.');
    }

    const currentEmail = currentUser.email;
    const isEmailChanged = validatedData.email !== currentEmail;

    if (isEmailChanged) {
      const existingUser = await prisma.user.findUnique({
        where: { email: validatedData.email },
      });

      if (existingUser && existingUser.id !== userId) {
        return fail(
          'CONFLICT',
          'This email is already in use by another account.',
        );
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
            userId,
            oldEmail: currentEmail,
            newEmail: validatedData.email,
            reason: 'User changed email via profile settings',
          },
        });
      }
    });

    return ok();
  } catch (error) {
    return failed('Error updating profile:', error, 'Failed to update profile. Please try again.');
  }
}
