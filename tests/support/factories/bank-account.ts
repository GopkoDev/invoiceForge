import type { BankAccount, Currency, PrismaClient } from '@prisma/client';

export type BankAccountOverrides = Partial<
  Omit<BankAccount, 'id' | 'senderProfileId' | 'createdAt' | 'updatedAt'>
> & { id?: string };

export async function createBankAccount(
  prisma: PrismaClient,
  senderProfileId: string,
  overrides: BankAccountOverrides = {}
): Promise<BankAccount> {
  return prisma.bankAccount.create({
    data: {
      senderProfileId,
      bankName: overrides.bankName ?? 'Test Bank',
      accountName: overrides.accountName ?? 'Test Freelancer',
      accountNumber: overrides.accountNumber ?? '0000000000',
      iban: overrides.iban,
      swift: overrides.swift,
      currency: (overrides.currency ?? 'USD') as Currency,
      // At most one default per sender profile (partial unique index, ADR-0005): the first account is.
      isDefault:
        overrides.isDefault ?? (await prisma.bankAccount.count({ where: { senderProfileId } })) === 0,
      ...(overrides.id ? { id: overrides.id } : {}),
    },
  });
}
