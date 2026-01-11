import { Prisma } from '@prisma/client';

export const senderProfileSelect = {
  id: true,
  name: true,
  legalName: true,
  address: true,
  city: true,
  country: true,
  postalCode: true,
  email: true,
  phone: true,
  taxId: true,
  logo: true,
  website: true,
  invoicePrefix: true,
  invoiceCounter: true,
} satisfies Prisma.SenderProfileSelect;

export const bankAccountSelect = {
  id: true,
  senderProfileId: true,
  bankName: true,
  accountName: true,
  accountNumber: true,
  iban: true,
  swift: true,
  currency: true,
  isDefault: true,
} satisfies Prisma.BankAccountSelect;

export const customerSelect = {
  id: true,
  name: true,
  companyName: true,
  email: true,
  address: true,
  city: true,
  country: true,
  postalCode: true,
  phone: true,
  taxId: true,
  defaultCurrency: true,
} satisfies Prisma.CustomerSelect;

export const productSelect = {
  id: true,
  name: true,
  description: true,
  unit: true,
  price: true,
  currency: true,
  isActive: true,
} satisfies Prisma.ProductSelect;

export const customPriceSelect = {
  id: true,
  productId: true,
  customerId: true,
  name: true,
  price: true,
} satisfies Prisma.CustomPriceSelect;

export const invoiceListSelect = {
  id: true,
  invoiceNumber: true,
  status: true,
  issueDate: true,
  dueDate: true,
  total: true,
  currency: true,
  customerName: true,
  senderName: true,
  createdAt: true,
} satisfies Prisma.InvoiceSelect;
