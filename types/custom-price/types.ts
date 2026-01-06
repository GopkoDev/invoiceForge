import { Prisma, Currency } from '@prisma/client';

export type CustomPriceWithRelations = Prisma.CustomPriceGetPayload<{
  include: {
    product: {
      select: {
        id: true;
        name: true;
        price: true;
        currency: true;
        unit: true;
        isActive: true;
      };
    };
    customer: {
      select: {
        id: true;
        name: true;
        companyName: true;
      };
    };
  };
}>;

export type SerializedCustomPrice = {
  id: string;
  productId: string;
  customerId: string;
  name: string | null;
  price: number;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  product: {
    id: string;
    name: string;
    price: number;
    currency: Currency;
    unit: string;
    isActive: boolean;
  };
  customer: {
    id: string;
    name: string;
    companyName: string | null;
  };
};
