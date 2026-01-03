import { z } from 'zod';
import { Currency } from '@prisma/client';

export const bankAccountFormSchema = z.object({
  bankName: z
    .string()
    .trim()
    .min(1, 'Bank name is required')
    .max(100, 'Bank name must be less than 100 characters'),
  accountName: z
    .string()
    .trim()
    .min(1, 'Account holder name is required')
    .max(100, 'Account holder name must be less than 100 characters'),
  accountNumber: z
    .string()
    .trim()
    .min(1, 'Account number is required')
    .max(50, 'Account number must be less than 50 characters'),
  iban: z
    .string()
    .trim()
    .max(34, 'IBAN must be less than 34 characters')
    .optional()
    .or(z.literal('')),
  swift: z
    .string()
    .trim()
    .max(11, 'SWIFT code must be less than 11 characters')
    .optional()
    .or(z.literal('')),
  currency: z.nativeEnum(Currency, {
    errorMap: () => ({ message: 'Please select a currency' }),
  }),
  isDefault: z.boolean().default(false),
});

export type BankAccountFormValues = z.infer<typeof bankAccountFormSchema>;

