import { z } from 'zod';
import { Currency, InvoiceStatus } from '@prisma/client';

export const invoiceItemSchema = z.object({
  id: z.string(),
  productId: z.string().optional(),
  productName: z.string().min(1, 'Product name is required'),
  description: z.string().optional().default(''),
  unit: z.string().min(1, 'Unit is required'),
  quantity: z.number().min(0.01, 'Quantity must be greater than 0'),
  price: z.number().min(0, 'Price must be non-negative'),
  total: z.number(),
});

export const invoiceFormSchema = z.object({
  invoiceNumber: z.string().min(1, 'Invoice number is required'),
  status: z.nativeEnum(InvoiceStatus).default('DRAFT'),
  senderProfileId: z.string().min(1, 'Sender profile is required'),
  bankAccountId: z.string().min(1, 'Bank account is required'),
  customerId: z.string().min(1, 'Customer is required'),
  issueDate: z.coerce.date(),
  dueDate: z.coerce.date(),
  currency: z.nativeEnum(Currency),
  poNumber: z.string().optional().default(''),
  paymentTerms: z.string().optional().default(''),
  items: z.array(invoiceItemSchema).min(1, 'At least one item is required'),
  taxRate: z.number().min(0).max(100).default(0),
  discount: z.number().min(0).default(0),
  shipping: z.number().min(0).default(0),
  notes: z.string().optional().default(''),
  terms: z.string().optional().default(''),
});

export type InvoiceFormValues = z.infer<typeof invoiceFormSchema>;
export type InvoiceItemFormValues = z.infer<typeof invoiceItemSchema>;
