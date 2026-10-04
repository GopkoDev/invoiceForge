import 'server-only';
import { prisma } from '@/prisma';
import {
  profileFormSchema,
  timeZoneSchema,
  TIME_ZONE_MESSAGE,
  type ProfileFormValues,
} from '@/lib/validations/profile';
import { resolveTimeZone } from '@/lib/services/_shared/time-zone';
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

export type Profile = {
  name: string | null;
  email: string | null;
  image: string | null;
  /** null = not saved yet, shown as UTC. */
  timeZone: string | null;
};

export async function getProfile(actor: ActingFreelancer): Promise<ActionResult<Profile>> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: actor.userId },
      select: { name: true, email: true, image: true, timeZone: true },
    });
    if (!user) return fail('NOT_FOUND', 'Account not found.');
    return ok(user);
  } catch (error) {
    return failed('Error loading profile:', error, 'Failed to load profile. Please try again.');
  }
}

/** The zone saved on the account, or null when none is saved yet (or the account is gone). */
export async function getSavedTimeZone(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { timeZone: true } });
  return user?.timeZone ?? null;
}

/**
 * First-visit seed (flow 12): saves the zone only while the column is still empty, so it never
 * overwrites a saved zone even when two first requests race. True when this call wrote it.
 */
export async function seedTimeZoneIfEmpty(userId: string, timeZone: string): Promise<boolean> {
  const { count } = await prisma.user.updateMany({
    where: { id: userId, timeZone: null },
    data: { timeZone },
  });
  return count === 1;
}

/** Settings change: a zone both Intl and pg_timezone_names know is saved; anything else is refused, never saved as UTC. */
export async function updateTimeZone(actor: ActingFreelancer, input: string): Promise<ActionResult<void>> {
  try {
    const parsed = timeZoneSchema.safeParse({ timeZone: input });
    if (!parsed.success) return zodValidationFailure(parsed.error);
    const { timeZone } = parsed.data;
    if ((await resolveTimeZone(timeZone)) !== timeZone) {
      return fail('VALIDATION', TIME_ZONE_MESSAGE, { fieldErrors: { timeZone: [TIME_ZONE_MESSAGE] } });
    }
    const { count } = await prisma.user.updateMany({ where: { id: actor.userId }, data: { timeZone } });
    if (count === 0) return fail('NOT_FOUND', 'Account not found.');
    return ok();
  } catch (error) {
    return failed('Error updating time zone:', error, 'Failed to update the time zone. Please try again.');
  }
}
