import { z } from 'zod';
import { Currency } from '@prisma/client';
import { optionalString } from '@/lib/helpers/zod-helpers';
import { MAX_AMOUNT, hasAtMostTwoDecimalPlaces } from '@/lib/validations/custom-price';

// invoice-integrity T13 (spec.md §5 AC-20): the price follows the custom-price rule — a number
// (parsed the way the custom-price schema coerces it), at most two decimal places, at most
// 99,999,999.99 — except that a product may cost 0. The form keeps it as a string.
const productPriceSchema = z
  .string()
  .min(1, 'Price is required')
  .superRefine((val, ctx) => {
    const value = Number(val);
    const message = Number.isNaN(value)
      ? 'Price must be a number.'
      : value < 0
        ? "Price can't be negative."
        : value > MAX_AMOUNT
          ? 'Price is too large.'
          : !hasAtMostTwoDecimalPlaces(value)
            ? 'Price can have at most 2 decimal places.'
            : null;
    if (message) ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  });

export const productFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(255),
  description: optionalString(z.string().trim().max(1000)),
  unit: z.string().trim().min(1, 'Unit is required').max(50),
  price: productPriceSchema,
  currency: z.nativeEnum(Currency),
  isActive: z.boolean(),
});

export type ProductFormValues = z.infer<typeof productFormSchema>;
