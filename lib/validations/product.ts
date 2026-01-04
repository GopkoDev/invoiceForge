import { z } from 'zod';
import { Currency } from '@prisma/client';
import { optionalString } from '@/lib/helpers/zod-helpers';

export const productFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(255),
  description: optionalString(z.string().trim().max(1000)),
  unit: z.string().trim().min(1, 'Unit is required').max(50),
  price: z
    .string()
    .min(1, 'Price is required')
    .refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) >= 0, {
      message: 'Price must be a valid positive number',
    }),
  currency: z.nativeEnum(Currency),
  isActive: z.boolean(),
});

export type ProductFormValues = z.infer<typeof productFormSchema>;
