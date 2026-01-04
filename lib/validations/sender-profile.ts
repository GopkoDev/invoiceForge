import { z } from 'zod';
import { optionalString, phoneValidation } from '@/lib/helpers/zod-helpers';

export const senderProfileFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(100, 'Name must be less than 100 characters'),
  legalName: optionalString(z.string().trim().max(200)),
  taxId: optionalString(z.string().trim().max(50)),
  address: optionalString(z.string().trim().max(200)),
  city: optionalString(z.string().trim().max(100)),
  country: optionalString(z.string().trim().max(100)),
  postalCode: optionalString(z.string().trim().max(20)),
  phone: optionalString(phoneValidation(z.string().trim().max(50))),
  email: optionalString(z.string().trim().email('Invalid email address')),
  website: optionalString(z.string().trim().url('Invalid URL format')),
  logo: optionalString(z.string().trim().url('Invalid URL format')),
  invoicePrefix: z
    .string()
    .trim()
    .min(1, 'Invoice prefix is required')
    .max(10, 'Invoice prefix must be less than 10 characters')
    .regex(
      /^[A-Z0-9-]+$/,
      'Invoice prefix must contain only uppercase letters, numbers, and hyphens'
    ),
  isDefault: z.boolean().default(false),
});

export type SenderProfileFormValues = z.infer<typeof senderProfileFormSchema>;
