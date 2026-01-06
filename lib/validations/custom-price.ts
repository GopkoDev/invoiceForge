import { z } from 'zod';
import { optionalString } from '@/lib/helpers/zod-helpers';

export const customPriceFormSchema = z.object({
  productId: z.string().min(1, 'Product is required'),
  name: optionalString(z.string().trim().max(100)),
  price: z.coerce
    .number({
      required_error: 'Price is required',
      invalid_type_error: 'Price must be a number',
    })
    .positive('Price must be positive'),
  notes: optionalString(z.string().trim().max(500)),
});

export type CustomPriceFormValues = z.infer<typeof customPriceFormSchema>;
