import { z } from 'zod';
import { optionalString } from '@/lib/helpers/zod-helpers';

// F-06 (contracts/server-actions.md §createCustomPrice: "price: number; > 0, ≤ 99 999 999.99,
// 2 dp"): shared with lib/validations/invoice.ts's own bound so both schemas agree on what "2
// decimal places" means; checked on the string form, never by re-doing the arithmetic in floats.
const MAX_AMOUNT = 99_999_999.99;

function hasAtMostTwoDecimalPlaces(value: number): boolean {
  if (!Number.isFinite(value)) return true; // let the number check report NaN/Infinity
  const str = Math.abs(value).toString();
  if (/e/i.test(str)) {
    return Math.abs(value - Math.round(value * 100) / 100) < Number.EPSILON * Math.abs(value || 1);
  }
  const dot = str.indexOf('.');
  return dot === -1 || str.length - dot - 1 <= 2;
}

/**
 * T21 (spec.md AC-16, AC-31; contracts/server-actions.md §createCustomPrice /
 * §updateCustomPrice): the single schema shared by create and update, so a negative price, a
 * non-number price and a too-long note are rejected with the same contract messages on both
 * paths. `customerId`/`productId` are only required on create (updateCustomPrice drops them —
 * the price keeps its existing link).
 */
export const customPriceSchema = z.object({
  customerId: z.string().min(1, 'Customer is required.'),
  productId: z.string().min(1, 'Product is required.'),
  name: optionalString(z.string().trim().max(100, 'Name must be 100 characters or fewer.')),
  price: z.coerce
    .number({
      required_error: 'Price must be a number.',
      invalid_type_error: 'Price must be a number.',
    })
    .positive('Price must be positive.')
    .max(MAX_AMOUNT, 'Price is too large.')
    .refine(hasAtMostTwoDecimalPlaces, 'Price can have at most 2 decimal places.'),
  notes: optionalString(
    z.string().trim().max(500, 'Note must be 500 characters or fewer.')
  ),
});

export type CustomPriceSchemaValues = z.infer<typeof customPriceSchema>;

/** Shared with update: `updateCustomPrice(id, { name?, price, notes? })` drops the ids. */
export const updateCustomPriceSchema = customPriceSchema.omit({
  customerId: true,
  productId: true,
});

export type UpdateCustomPriceValues = z.infer<typeof updateCustomPriceSchema>;

// Backward-compatible alias used by the modal/form (create shape: full schema).
export type CustomPriceFormValues = CustomPriceSchemaValues;
export const customPriceFormSchema = customPriceSchema;
