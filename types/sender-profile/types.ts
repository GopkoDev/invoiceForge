import { Prisma } from '@prisma/client';

export type SenderProfileWithRelations = Prisma.SenderProfileGetPayload<{
  include: {
    bankAccounts: true;
    _count: {
      select: {
        invoices: true;
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
