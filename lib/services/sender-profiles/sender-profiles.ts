import 'server-only';
import { prisma } from '@/prisma';
import type { SenderProfile } from '@prisma/client';
import { senderProfileFormSchema, type SenderProfileFormValues } from '@/lib/validations/sender-profile';
import type { SenderProfileWithRelations } from '@/types/sender-profile/types';
import { fail, ok, type ActionFailure, type ActionResult } from '@/types/result';
import type { ActingFreelancer } from '@/lib/services/_shared/acting-freelancer';
import { ilikeAny, paginate, parseListQuery, type ListQuery, type Page } from '@/lib/services/_shared/list-query';
import { notFoundOnMiss } from '@/lib/services/_shared/owner-scope';
import {
  failed,
  hasInvoicesConflict,
  isRestrictForeignKeyError,
  zodValidationFailure,
} from '@/lib/services/_shared/result-helpers';

const NOT_FOUND_MESSAGE = 'Sender profile not found.';
const PREFIX_TAKEN_MESSAGE = 'This invoice prefix is already in use. Please choose another one.';

const withCounts = {
  _count: { select: { invoices: true, bankAccounts: true } },
} as const;

function isFailure(value: unknown): value is ActionFailure {
  return typeof value === 'object' && value !== null && 'success' in value && value.success === false;
}

export async function listSenderProfiles(
  actor: ActingFreelancer,
  query?: ListQuery,
): Promise<ActionResult<Page<SenderProfileWithRelations>>> {
  try {
    const parsed = parseListQuery(query);
    if (!parsed.success) return parsed;

    const where = {
      userId: actor.userId,
      ...ilikeAny(['name', 'legalName'], parsed.data.search ?? ''),
    };
    const page = await paginate<SenderProfileWithRelations>({
      query: parsed.data,
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
      count: () => prisma.senderProfile.count({ where }),
      findMany: (args) =>
        prisma.senderProfile.findMany({ where, include: withCounts, ...args } as never) as unknown as Promise<
          SenderProfileWithRelations[]
        >,
    });
    return ok(page);
  } catch (error) {
    return failed('Error fetching sender profiles:', error, 'Failed to fetch sender profiles. Please try again.');
  }
}

export async function getSenderProfile(
  actor: ActingFreelancer,
  id: string,
): Promise<ActionResult<SenderProfileWithRelations>> {
  try {
    const profile = await prisma.senderProfile.findFirst({
      where: { id, userId: actor.userId },
      include: withCounts,
    });
    if (!profile) return fail('NOT_FOUND', NOT_FOUND_MESSAGE);
    return ok(profile);
  } catch (error) {
    return failed('Error fetching sender profile:', error, 'Failed to fetch sender profile. Please try again.');
  }
}

export async function getSenderProfileLogo(
  actor: ActingFreelancer,
  id: string,
): Promise<ActionResult<{ logo: string | null }>> {
  try {
    const profile = await prisma.senderProfile.findFirst({
      where: { id, userId: actor.userId },
      select: { logo: true },
    });
    if (!profile) return fail('NOT_FOUND', NOT_FOUND_MESSAGE);
    return ok({ logo: profile.logo });
  } catch (error) {
    return failed('Error fetching sender profile logo:', error, 'Failed to fetch sender profile. Please try again.');
  }
}

export async function createSenderProfile(
  actor: ActingFreelancer,
  input: SenderProfileFormValues,
): Promise<ActionResult<SenderProfile>> {
  try {
    const parsed = senderProfileFormSchema.safeParse(input);
    if (!parsed.success) return zodValidationFailure(parsed.error);
    const validatedData = parsed.data;

    const existingPrefix = await prisma.senderProfile.findUnique({
      where: { invoicePrefix: validatedData.invoicePrefix },
    });
    if (existingPrefix) return fail('CONFLICT', PREFIX_TAKEN_MESSAGE);

    if (validatedData.isDefault) {
      await prisma.senderProfile.updateMany({
        where: { userId: actor.userId },
        data: { isDefault: false },
      });
    }

    const senderProfile = await prisma.senderProfile.create({
      data: { userId: actor.userId, ...validatedData },
    });
    return ok(senderProfile);
  } catch (error) {
    return failed('Error creating sender profile:', error, 'Failed to create sender profile. Please try again.');
  }
}

export async function updateSenderProfile(
  actor: ActingFreelancer,
  id: string,
  input: SenderProfileFormValues,
): Promise<ActionResult<SenderProfile>> {
  try {
    const parsed = senderProfileFormSchema.safeParse(input);
    if (!parsed.success) return zodValidationFailure(parsed.error);
    const validatedData = parsed.data;
    const { userId } = actor;

    const existingProfile = await prisma.senderProfile.findFirst({ where: { id, userId } });
    if (!existingProfile) return fail('NOT_FOUND', NOT_FOUND_MESSAGE);

    if (validatedData.invoicePrefix !== existingProfile.invoicePrefix) {
      const existingPrefix = await prisma.senderProfile.findUnique({
        where: { invoicePrefix: validatedData.invoicePrefix },
      });
      if (existingPrefix && existingPrefix.id !== id) return fail('CONFLICT', PREFIX_TAKEN_MESSAGE);
    }

    if (validatedData.isDefault && !existingProfile.isDefault) {
      await prisma.senderProfile.updateMany({
        where: { userId, id: { not: id } },
        data: { isDefault: false },
      });
    }

    const updated = await notFoundOnMiss(
      prisma.senderProfile.update({ where: { id, userId }, data: { ...validatedData } }),
      NOT_FOUND_MESSAGE,
    );
    if (isFailure(updated)) return updated;
    return ok(updated);
  } catch (error) {
    return failed('Error updating sender profile:', error, 'Failed to update sender profile. Please try again.');
  }
}

/** F-43: counts invoices that would Restrict-block deleting this sender profile, whether they
 * reference it directly (invoice.senderProfileId) or through one of its bank accounts
 * (invoice.bankAccountId) — both FKs are Restrict onto rows this delete's cascade removes.
 * Owner-scoped: only the actor's own profile's invoices are counted. */
async function countSenderProfileInvoices(senderProfileId: string, userId: string): Promise<number> {
  return prisma.invoice.count({
    where: {
      OR: [{ senderProfileId }, { bankAccount: { senderProfileId } }],
      senderProfile: { userId },
    },
  });
}

export async function deleteSenderProfile(actor: ActingFreelancer, id: string): Promise<ActionResult> {
  try {
    const { userId } = actor;

    const existingProfile = await prisma.senderProfile.findFirst({ where: { id, userId }, select: { id: true } });
    if (!existingProfile) return fail('NOT_FOUND', NOT_FOUND_MESSAGE);

    const invoiceCount = await countSenderProfileInvoices(id, userId);
    if (invoiceCount > 0) return hasInvoicesConflict('sender profile', invoiceCount);

    try {
      // Cascade removes the profile's bank accounts.
      const deleted = await notFoundOnMiss(prisma.senderProfile.delete({ where: { id, userId } }), NOT_FOUND_MESSAGE);
      if (isFailure(deleted)) return deleted;
    } catch (deleteError) {
      if (isRestrictForeignKeyError(deleteError)) {
        // An invoice was saved between the count and this delete (Restrict FK, P2003): recount
        // and report the same CONFLICT, never FAILED (AC-17).
        return hasInvoicesConflict('sender profile', await countSenderProfileInvoices(id, userId));
      }
      throw deleteError;
    }

    return ok();
  } catch (error) {
    return failed('Error deleting sender profile:', error, 'Failed to delete sender profile. Please try again.');
  }
}
