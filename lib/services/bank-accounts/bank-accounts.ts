import 'server-only';
import type { BankAccount, Prisma } from '@prisma/client';
import { prisma } from '@/prisma';
import { bankAccountFormSchema, type BankAccountFormValues } from '@/lib/validations/bank-account';
import type { BankAccountWithRelations } from '@/types/sender-profile/types';
import { fail, ok, type ActionFailure, type ActionResult } from '@/types/result';
import { failed, isUniqueConstraintError, zodValidationFailure } from '@/lib/services/_shared/result-helpers';
import { captureMessage } from '@sentry/nextjs';
import { notFoundOnMiss } from '@/lib/services/_shared/owner-scope';
import { ilikeAny, paginate, parseListQuery, type ListQuery, type Page } from '@/lib/services/_shared/list-query';
import type { ActingFreelancer } from '@/lib/services/_shared/acting-freelancer';

const PROFILE_NOT_FOUND = 'Sender profile not found.';
const ACCOUNT_NOT_FOUND = 'Bank account not found.';

// invoice-integrity T12 (ADR-0005, AC-13, AC-17, AC-17b): exactly one default account per sender
// profile. The partial unique index BankAccount_senderProfileId_isDefault_key guarantees "at most
// one"; every default-changing write runs under the sender profile's row lock (scoped by the owner),
// which serializes parallel requests and keeps "at least one". A failure rolls everything back.
const DEFAULT_INDEX = 'BankAccount_senderProfileId_isDefault_key';
const UNSET_DEFAULT_MESSAGE =
  "The default account can't be switched off. Make another account the default instead.";

/** A unique hit on the default index means a path skipped the lock: retryable, never FAILED. */
export function defaultAccountConflict(): ActionFailure {
  return fail('CONFLICT', "Couldn't change the default account. Please try again.");
}

function isDefaultIndexConflict(error: unknown): boolean {
  if (!isUniqueConstraintError(error)) return false;
  const meta = JSON.stringify((error as { meta?: unknown }).meta ?? {});
  return meta.includes(DEFAULT_INDEX) || meta.includes('isDefault');
}

/** Refusal decided inside the locked transaction: rolls it back, then returned as is. */
class Refusal extends Error {
  constructor(public readonly result: ActionFailure) {
    super(result.code);
  }
}

/** Runs `write` in one transaction holding the sender profile's row lock; a foreign or missing
 * profile locks nothing and is NOT_FOUND. */
async function underProfileLock<T>(
  senderProfileId: string,
  userId: string,
  notFound: string,
  write: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<unknown[]>`
      SELECT 1 FROM "SenderProfile" WHERE "id" = ${senderProfileId} AND "userId" = ${userId} FOR UPDATE`;
    if (locked.length === 0) throw new Refusal(fail('NOT_FOUND', notFound));
    return write(tx);
  });
}

function settled<T>(error: unknown): ActionResult<T> | null {
  if (error instanceof Refusal) return error.result;
  if (isDefaultIndexConflict(error)) {
    captureMessage('default_index_conflict', { extra: { index: DEFAULT_INDEX } });
    return defaultAccountConflict();
  }
  return null;
}

export async function listBankAccounts(
  actor: ActingFreelancer,
  senderProfileId: string,
  query?: ListQuery,
): Promise<ActionResult<Page<BankAccountWithRelations>>> {
  try {
    const parsed = parseListQuery(query);
    if (!parsed.success) return parsed;

    const profile = await prisma.senderProfile.findFirst({
      where: { id: senderProfileId, userId: actor.userId },
      select: { id: true },
    });
    if (!profile) return fail('NOT_FOUND', PROFILE_NOT_FOUND);

    // Account number and IBAN are deliberately not searchable.
    const where = {
      senderProfileId,
      ...ilikeAny(['bankName', 'accountName'], parsed.data.search ?? ''),
    };

    const page = await paginate({
      query: parsed.data,
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      count: () => prisma.bankAccount.count({ where }),
      findMany: ({ skip, take, orderBy }) =>
        prisma.bankAccount.findMany({
          where,
          include: { _count: { select: { invoices: true } } },
          orderBy: orderBy as never,
          skip,
          take,
        }),
    });

    return ok(page);
  } catch (error) {
    return failed('Error fetching bank accounts:', error, 'Failed to fetch bank accounts. Please try again.');
  }
}

export async function createBankAccount(
  actor: ActingFreelancer,
  senderProfileId: string,
  input: BankAccountFormValues,
): Promise<ActionResult<BankAccount>> {
  try {
    const parsed = bankAccountFormSchema.safeParse(input);
    if (!parsed.success) return zodValidationFailure(parsed.error);

    const bankAccount = await underProfileLock(senderProfileId, actor.userId, PROFILE_NOT_FOUND, async (tx) => {
      // The first account is the default whatever was sent (AC-17b); asking for it switches.
      const siblings = await tx.bankAccount.count({ where: { senderProfileId } });
      const isDefault = siblings === 0 || parsed.data.isDefault;
      if (isDefault && siblings > 0) {
        await tx.bankAccount.updateMany({
          where: { senderProfileId, isDefault: true, senderProfile: { userId: actor.userId } },
          data: { isDefault: false },
        });
      }
      return tx.bankAccount.create({ data: { senderProfileId, ...parsed.data, isDefault } });
    });
    return ok(bankAccount);
  } catch (error) {
    const result = settled<BankAccount>(error);
    if (result) return result;
    return failed('Error creating bank account:', error, 'Failed to create bank account. Please try again.');
  }
}

export async function updateBankAccount(
  actor: ActingFreelancer,
  id: string,
  input: BankAccountFormValues,
): Promise<ActionResult<BankAccount>> {
  try {
    const parsed = bankAccountFormSchema.safeParse(input);
    if (!parsed.success) return zodValidationFailure(parsed.error);

    const { userId } = actor;
    const owner = await prisma.bankAccount.findFirst({
      where: { id, senderProfile: { userId } },
      select: { senderProfileId: true },
    });
    if (!owner) return fail('NOT_FOUND', ACCOUNT_NOT_FOUND);

    const written = await underProfileLock(owner.senderProfileId, userId, ACCOUNT_NOT_FOUND, async (tx) => {
      // 1. Re-read under the lock (it may have been deleted meanwhile).
      const existing = await tx.bankAccount.findFirst({ where: { id, senderProfile: { userId } } });
      if (!existing) throw new Refusal(fail('NOT_FOUND', ACCOUNT_NOT_FOUND));

      // 2. AC-13: the currency of an account used by invoices (any status) can't change.
      if (parsed.data.currency !== existing.currency) {
        const invoiceCount = await tx.invoice.count({ where: { bankAccountId: id, senderProfile: { userId } } });
        if (invoiceCount > 0) {
          const message = `The currency of an account used by ${invoiceCount} invoice(s) can't change.`;
          throw new Refusal(
            fail('CONFLICT', message, {
              fieldErrors: { currency: [message] },
              details: { kind: 'HAS_INVOICES', invoiceCount },
            }),
          );
        }
      }

      // 3. AC-17b: the default can only be replaced, never switched off.
      if (existing.isDefault && !parsed.data.isDefault) {
        throw new Refusal(
          fail('VALIDATION', UNSET_DEFAULT_MESSAGE, { fieldErrors: { isDefault: [UNSET_DEFAULT_MESSAGE] } }),
        );
      }

      // 4. AC-17: make this one the default — clear the current one, then set this.
      if (parsed.data.isDefault && !existing.isDefault) {
        await tx.bankAccount.updateMany({
          where: {
            senderProfileId: existing.senderProfileId,
            isDefault: true,
            id: { not: id },
            senderProfile: { userId },
          },
          data: { isDefault: false },
        });
      }

      return notFoundOnMiss(
        tx.bankAccount.update({ where: { id, senderProfile: { userId } }, data: parsed.data }),
        ACCOUNT_NOT_FOUND,
      );
    });
    if ('success' in written) return written;
    return ok(written);
  } catch (error) {
    const result = settled<BankAccount>(error);
    if (result) return result;
    return failed('Error updating bank account:', error, 'Failed to update bank account. Please try again.');
  }
}

export async function deleteBankAccount(
  actor: ActingFreelancer,
  id: string,
): Promise<ActionResult<{ senderProfileId: string }>> {
  try {
    const existing = await prisma.bankAccount.findFirst({
      where: { id, senderProfile: { userId: actor.userId } },
      include: { invoices: { take: 1, select: { id: true } } },
    });
    if (!existing) return fail('NOT_FOUND', ACCOUNT_NOT_FOUND);

    if (existing.invoices.length > 0) {
      return fail(
        'CONFLICT',
        'Cannot delete bank account with existing invoices. Please delete or reassign invoices first.',
      );
    }

    const written = await underProfileLock(existing.senderProfileId, actor.userId, ACCOUNT_NOT_FOUND, async (tx) => {
      const locked = await tx.bankAccount.findFirst({
        where: { id, senderProfile: { userId: actor.userId } },
        select: { isDefault: true },
      });
      if (!locked) throw new Refusal(fail('NOT_FOUND', ACCOUNT_NOT_FOUND));
      const deleted = await notFoundOnMiss(
        tx.bankAccount.delete({ where: { id, senderProfile: { userId: actor.userId } } }),
        ACCOUNT_NOT_FOUND,
      );
      // AC-17b: the earliest-created remaining account becomes the default.
      if (!('success' in deleted) && locked.isDefault) {
        const next = await tx.bankAccount.findFirst({
          where: { senderProfileId: existing.senderProfileId },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: { id: true },
        });
        if (next) {
          await tx.bankAccount.update({
            where: { id: next.id, senderProfile: { userId: actor.userId } },
            data: { isDefault: true },
          });
        }
      }
      return deleted;
    });
    if ('success' in written) return written;
    return ok({ senderProfileId: existing.senderProfileId });
  } catch (error) {
    const result = settled<{ senderProfileId: string }>(error);
    if (result) return result;
    return failed('Error deleting bank account:', error, 'Failed to delete bank account. Please try again.');
  }
}
