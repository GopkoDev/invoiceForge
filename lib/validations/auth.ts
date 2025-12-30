import { z } from 'zod';

export const loginEmailSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Invalid email address')
    .max(100, 'Email is too long'),
});

export type LoginEmailInput = z.infer<typeof loginEmailSchema>;
