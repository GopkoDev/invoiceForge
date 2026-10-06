import { z } from 'zod';
import {
  isWebAddress,
  WEB_ADDRESS_MESSAGE,
} from '@/lib/validations/web-address';
import { optionalString, phoneValidation } from '@/lib/helpers/zod-helpers';

/**
 * T20 (AC-04, contracts/server-actions.md §createSenderProfile/updateSenderProfile): the logo
 * link must be a secure (https:) web address so the PDF path never has to fetch a plain-http,
 * javascript: or data: link. Protocol comparison is case-insensitive (HTTPS://… is allowed).
 */
const SECURE_LOGO_MESSAGE =
  'The link must be a secure web address (https://…).';

function isSecureHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol.toLowerCase() === 'https:';
  } catch {
    return false;
  }
}

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
  website: optionalString(
    z.string().trim().refine(isWebAddress, WEB_ADDRESS_MESSAGE)
  ),
  logo: optionalString(
    z.string().trim().refine(isSecureHttpsUrl, SECURE_LOGO_MESSAGE)
  ),
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
