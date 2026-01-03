import { z } from 'zod';

export const senderProfileFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(100, 'Name must be less than 100 characters'),
  legalName: z.string().trim().max(200).optional().or(z.literal('')),
  taxId: z.string().trim().max(50).optional().or(z.literal('')),
  address: z.string().trim().max(200).optional().or(z.literal('')),
  city: z.string().trim().max(100).optional().or(z.literal('')),
  country: z.string().trim().max(100).optional().or(z.literal('')),
  postalCode: z.string().trim().max(20).optional().or(z.literal('')),
  phone: z.string().trim().max(50).optional().or(z.literal('')),
  email: z
    .string()
    .trim()
    .email('Invalid email address')
    .optional()
    .or(z.literal('')),
  website: z
    .string()
    .trim()
    .url('Invalid URL format')
    .optional()
    .or(z.literal('')),
  logo: z
    .string()
    .trim()
    .url('Invalid URL format')
    .optional()
    .or(z.literal('')),
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
