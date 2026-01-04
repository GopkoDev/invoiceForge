import { Prisma, Currency } from '@prisma/client';

export type ProductWithRelations = Prisma.ProductGetPayload<{
  include: {
    _count: {
      select: {
        invoiceItems: true;
        customPrices: true;
      };
    };
  };
}>;

// Serialized version for client components (Decimal converted to number)
export type SerializedProduct = {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  unit: string;
  price: number;
  currency: Currency;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  _count: {
    invoiceItems: number;
    customPrices: number;
  };
};
