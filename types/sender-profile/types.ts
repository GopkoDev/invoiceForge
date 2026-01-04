import { Prisma } from '@prisma/client';

/**
 * Sender profile with counts (without bank accounts array)
 * Bank accounts should be fetched separately when needed
 */
export type SenderProfileWithRelations = Prisma.SenderProfileGetPayload<{
  include: {
    _count: {
      select: {
        invoices: true;
        bankAccounts: true;
      };
    };
  };
}>;

export type BankAccountWithRelations = Prisma.BankAccountGetPayload<{
  include: {
    _count: {
      select: {
        invoices: true;
      };
    };
  };
}>;
