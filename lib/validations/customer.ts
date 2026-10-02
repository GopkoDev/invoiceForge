import { z } from 'zod';
import {
  isWebAddress,
  WEB_ADDRESS_MESSAGE,
} from '@/lib/validations/web-address';
import { Currency } from '@prisma/client';
import { optionalString, phoneValidation } from '@/lib/helpers/zod-helpers';

export const customerFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(255),
  companyName: optionalString(z.string().trim().max(255)),
  taxId: optionalString(z.string().trim().max(100)),
  email: optionalString(z.string().trim().email('Invalid email')),
  phone: optionalString(phoneValidation(z.string().trim().max(50))),
  website: optionalString(
    z.string().trim().refine(isWebAddress, WEB_ADDRESS_MESSAGE)
  ),
  image: optionalString(
    z.string().trim().refine(isWebAddress, WEB_ADDRESS_MESSAGE)
  ),
  address: optionalString(z.string().trim().max(500)),
  city: optionalString(z.string().trim().max(100)),
  country: optionalString(z.string().trim().max(100)),
  postalCode: optionalString(z.string().trim().max(20)),
  defaultCurrency: z.nativeEnum(Currency),
  notes: optionalString(z.string().trim().max(1000)),
});

export type CustomerFormValues = z.infer<typeof customerFormSchema>;
