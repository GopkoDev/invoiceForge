import { z } from 'zod';
import { Currency } from '@prisma/client';
import { optionalString } from '@/lib/helpers/zod-helpers';
import { MAX_AMOUNT } from '@/lib/validations/custom-price';

// invoice-integrity T13/T25 (spec.md §5 AC-20, contracts/server-actions.md §Products): the price is
// checked on the raw string against the contract shape ^\d{1,8}(\.\d{1,2})?$ — no trimming, so
// " ", "0x10", "0b11", "1e3" and " 12.00 " are "not a number" — with the messages in their order
// (number, negative, too large, decimals). A product may cost 0.
const PRICE_PARTS = /^(-?)(\d+)(?:\.(\d+))?$/;

function priceMessage(val: string): string | null {
  if (val === '') return null; // 'Price is required' is already reported
  const parts = PRICE_PARTS.exec(val);
  if (!parts) return 'Price must be a number.';
  const [, sign, whole, fraction = ''] = parts;
  if (sign) return "Price can't be negative.";
  if (whole.length > 8 || Number(val) > MAX_AMOUNT) return 'Price is too large.';
  if (fraction.length > 2) return 'Price can have at most 2 decimal places.';
  return null;
}

const productPriceString = z
  .string()
  .min(1, 'Price is required')
  .superRefine((val, ctx) => {
    const message = priceMessage(val);
    if (message) ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  });

// What the product form edits and the actions receive: the price stays a string.
export const productFormInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(255),
  description: optionalString(z.string().trim().max(1000)),
  unit: z.string().trim().min(1, 'Unit is required').max(50),
  price: productPriceString,
  currency: z.nativeEnum(Currency),
  isActive: z.boolean(),
});

// The service's schema: the same rules, and it yields the very number it validated, which the
// service stores as is (T25, review F5).
export const productFormSchema = productFormInputSchema.extend({
  price: productPriceString.transform((val) => Number(val)),
});

export type ProductFormValues = z.infer<typeof productFormInputSchema>;
