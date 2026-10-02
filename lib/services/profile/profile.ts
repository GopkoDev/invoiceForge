import 'server-only';
import { prisma } from '@/prisma';
import { profileFormSchema, type ProfileFormValues } from '@/lib/validations/profile';
import { fail, ok, type ActionResult } from '@/types/result';
import type { ActingFreelancer } from '@/lib/services/_shared/acting-freelancer';
import { failed, zodValidationFailure } from '@/lib/services/_shared/result-helpers';

export async function updateProfile(
  actor: ActingFreelancer,
  input: ProfileFormValues,
): Promise<ActionResult<void>> {
  const { userId } = actor;
  try {
    const parsed = profileFormSchema.safeParse(input);
    if (!parsed.success) return zodValidationFailure(parsed.error);
    const validatedData = parsed.data;

    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!currentUser) return fail('NOT_FOUND', 'Account not found.');

    const currentEmail = currentUser.email;
    const isEmailChanged = validatedData.email !== currentEmail;

    if (isEmailChanged) {
      const existingUser = await prisma.user.findUnique({
        where: { email: validatedData.email },
      });
      if (existingUser && existingUser.id !== userId) {
        return fail('CONFLICT', 'This email is already in use by another account.');
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          name: validatedData.name,
          email: validatedData.email,
          image:
            validatedData.image && validatedData.image !== '' ? validatedData.image : null,
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
