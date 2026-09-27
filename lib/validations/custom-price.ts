import { z } from 'zod';
import { optionalString } from '@/lib/helpers/zod-helpers';

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
    .positive('Price must be positive.'),
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
