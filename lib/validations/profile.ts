import { z } from 'zod';
import { isWebAddress, WEB_ADDRESS_MESSAGE } from '@/lib/validations/web-address';

export const profileFormSchema = z.object({
  name: z.string().trim().max(50, 'Name must be less than 50 characters'),
  email: z.string().email('Invalid email address'),
  image: z.string().refine(isWebAddress, WEB_ADDRESS_MESSAGE).optional().or(z.literal('')),
});

export type ProfileFormValues = z.infer<typeof profileFormSchema>;
