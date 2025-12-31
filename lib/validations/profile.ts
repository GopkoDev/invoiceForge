import { z } from 'zod';

export const profileFormSchema = z.object({
  name: z.string().trim().max(50, 'Name must be less than 50 characters'),
  email: z.string().email('Invalid email address'),
  image: z.string().url('Invalid URL format').optional().or(z.literal('')),
});

export type ProfileFormValues = z.infer<typeof profileFormSchema>;
