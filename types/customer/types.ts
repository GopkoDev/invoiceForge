import { Prisma } from '@prisma/client';

export type CustomerWithRelations = Prisma.CustomerGetPayload<{
  include: {
    _count: {
      select: {
        invoices: true;
        customPrices: true;
      };
    };
  };
}>;
