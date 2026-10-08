import 'server-only';
import { prisma } from '@/prisma';
import type { Prisma, SenderProfile } from '@prisma/client';
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
  isUniqueHitOn,
  zodValidationFailure,
} from '@/lib/services/_shared/result-helpers';
import { captureMessage } from '@sentry/nextjs';

const NOT_FOUND_MESSAGE = 'Sender profile not found.';
const PREFIX_TAKEN_MESSAGE = 'This invoice prefix is already in use. Please choose another one.';

const withCounts = {
  _count: { select: { invoices: true, bankAccounts: true } },
} as const;

// invoice-integrity T11 (ADR-0005, AC-17, AC-17b): exactly one default per Freelancer. The partial
// unique index SenderProfile_userId_isDefault_key guarantees "at most one"; every default-changing
// write runs under the Freelancer's User row lock, which serializes parallel requests and keeps
// "at least one". A failure rolls the whole transaction back, so the old default stays.
const DEFAULT_INDEX = 'SenderProfile_userId_isDefault_key';
const UNSET_DEFAULT_MESSAGE =
  "The default sender profile can't be switched off. Make another profile the default instead.";

/** A unique hit on the default index means a path skipped the lock: retryable, never FAILED. */
export function defaultConflict(): ActionFailure {
  return fail('CONFLICT', "Couldn't change the default sender profile. Please try again.");
}

/** A P2002 on DEFAULT_INDEX itself, matched by name (see isUniqueHitOn); any other unique hit is not. */
export function isDefaultIndexConflict(error: unknown): boolean {
  return isUniqueHitOn(error, DEFAULT_INDEX);
}

/** Refusal decided inside the locked transaction: rolls it back, then returned as is. */
class Refusal extends Error {
  constructor(public readonly result: ActionFailure) {
    super(result.code);
  }
}

/** Runs `write` in one transaction holding the Freelancer's User row lock (ADR-0005). */
async function underOwnerLock<T>(userId: string, write: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    return write(tx);
  });
}

function settled<T>(error: unknown): ActionResult<T> | null {
  if (error instanceof Refusal) return error.result;
  if (isDefaultIndexConflict(error)) {
    captureMessage('default_index_conflict', { extra: { index: DEFAULT_INDEX } });
    return defaultConflict();
  }
  return null;
}

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

    const senderProfile = await underOwnerLock(actor.userId, async (tx) => {
      // The first profile is the default whatever was sent (AC-17b); asking for it switches.
      const siblings = await tx.senderProfile.count({ where: { userId: actor.userId } });
      const isDefault = siblings === 0 || validatedData.isDefault;
      if (isDefault && siblings > 0) {
        await tx.senderProfile.updateMany({
          where: { userId: actor.userId, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.senderProfile.create({ data: { userId: actor.userId, ...validatedData, isDefault } });
    });
    return ok(senderProfile);
  } catch (error) {
    const result = settled<SenderProfile>(error);
    if (result) return result;
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

    const updated = await underOwnerLock(userId, async (tx) => {
      const existingProfile = await tx.senderProfile.findFirst({ where: { id, userId } });
      if (!existingProfile) throw new Refusal(fail('NOT_FOUND', NOT_FOUND_MESSAGE));

      if (validatedData.invoicePrefix !== existingProfile.invoicePrefix) {
        const existingPrefix = await tx.senderProfile.findUnique({
          where: { invoicePrefix: validatedData.invoicePrefix },
        });
        if (existingPrefix && existingPrefix.id !== id) {
          throw new Refusal(fail('CONFLICT', PREFIX_TAKEN_MESSAGE));
        }
      }

      // The default can only be replaced, never switched off (AC-17b).
      if (existingProfile.isDefault && !validatedData.isDefault) {
        throw new Refusal(
          fail('VALIDATION', UNSET_DEFAULT_MESSAGE, { fieldErrors: { isDefault: [UNSET_DEFAULT_MESSAGE] } })
        );
      }
      // Make this one the default: clear the current one, then set this, in the same transaction.
      if (validatedData.isDefault && !existingProfile.isDefault) {
        await tx.senderProfile.updateMany({
          where: { userId, isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      }

      return notFoundOnMiss(
        tx.senderProfile.update({ where: { id, userId }, data: { ...validatedData } }),
        NOT_FOUND_MESSAGE,
      );
    });
    if (isFailure(updated)) return updated;
    return ok(updated);
  } catch (error) {
    const result = settled<SenderProfile>(error);
    if (result) return result;
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
      await underOwnerLock(userId, async (tx) => {
        const locked = await tx.senderProfile.findFirst({ where: { id, userId }, select: { isDefault: true } });
        if (!locked) throw new Refusal(fail('NOT_FOUND', NOT_FOUND_MESSAGE));

        // Cascade removes the profile's bank accounts.
        const deleted = await notFoundOnMiss(tx.senderProfile.delete({ where: { id, userId } }), NOT_FOUND_MESSAGE);
        if (isFailure(deleted)) throw new Refusal(deleted);

        // AC-17b: the earliest-created remaining profile becomes the default.
        if (locked.isDefault) {
          const next = await tx.senderProfile.findFirst({
            where: { userId },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            select: { id: true },
          });
          if (next) await tx.senderProfile.update({ where: { id: next.id, userId }, data: { isDefault: true } });
        }
      });
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
    const result = settled<void>(error);
    if (result) return result;
    return failed('Error deleting sender profile:', error, 'Failed to delete sender profile. Please try again.');
  }
}
