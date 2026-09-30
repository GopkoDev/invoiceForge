// T21 (spec.md §5 AC-16) — customPriceSchema is one shared schema used on both create and
// update, so a negative price, a non-number price and a too-long note are rejected with the
// same contract messages on both paths.
//
// docs/features/architecture-hardening/tasks/t21-custom-price-validation-and-links.md (Inlined
// context: contracts/server-actions.md §createCustomPrice / §updateCustomPrice, verbatim: "The
// same schema and messages as create (AC-16): 'Price must be a number.', 'Price must be
// positive.', 'Note must be 500 characters or fewer.'") and the test-plan.md row "custom-price
// schema is shared by create and update" (unit, AC-16): negative, non-number and too-long note
// are rejected with the same messages on both paths.
//
// Assumed API (task file §Checklist, verbatim): "One shared schema (`customPriceSchema`) with
// the three contract messages; `customerId` + `productId` required for create —
// `lib/validations/custom-price.ts`" and "`updateCustomPrice`: ... same schema (pick)". The
// update path is modeled here as `customPriceSchema.omit({ customerId: true, productId: true })`
// (a plain ZodObject, not a ZodEffects, so `.omit` works), matching the checklist's "same schema
// (pick)" note.
//
// RED (T21 not yet implemented): `lib/validations/custom-price.ts` exports only
// `customPriceFormSchema` today (no `customPriceSchema`, no `customerId` field at all), and its
// messages don't match the contract ('Price is required' / 'Price must be a number' without a
// trailing period / no explicit notes-length message), so this import fails to resolve the
// named export.
import { describe, expect, it } from 'vitest';
import { customPriceSchema } from '@/lib/validations/custom-price';

const PRICE_NOT_NUMBER = 'Price must be a number.';
const PRICE_NOT_POSITIVE = 'Price must be positive.';
const NOTE_TOO_LONG = 'Note must be 500 characters or fewer.';

function createInput(overrides: Record<string, unknown> = {}) {
  return {
    customerId: 'cust_1',
    productId: 'prod_1',
    name: 'Wholesale',
    price: 50,
    notes: 'ok',
    ...overrides,
  };
}

function updateInput(overrides: Record<string, unknown> = {}) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { customerId, productId, ...rest } = createInput(overrides);
  return rest;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const updateSchema = (customPriceSchema as any)?.omit?.({
  customerId: true,
  productId: true,
});

function messagesFor(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: any,
  input: Record<string, unknown>,
  path: string
): string[] {
  const result = schema.safeParse(input);
  if (result.success) return [];
  return result.error.issues
    .filter((issue: { path: (string | number)[] }) => issue.path.join('.') === path)
    .map((issue: { message: string }) => issue.message);
}

describe('customPriceSchema — shared create/update messages (AC-16)', () => {
  it.each([
    ['create', () => customPriceSchema, createInput],
    ['update', () => updateSchema, updateInput],
  ])('%s: rejects a negative price with "Price must be positive."', (_label, getSchema, buildInput) => {
    const messages = messagesFor(getSchema(), { ...buildInput(), price: -5 }, 'price');
    expect(messages).toEqual([PRICE_NOT_POSITIVE]);
  });

  it.each([
    ['create', () => customPriceSchema, createInput],
    ['update', () => updateSchema, updateInput],
  ])('%s: rejects a non-number price with "Price must be a number."', (_label, getSchema, buildInput) => {
    const messages = messagesFor(getSchema(), { ...buildInput(), price: 'abc' }, 'price');
    expect(messages).toEqual([PRICE_NOT_NUMBER]);
  });

  it.each([
    ['create', () => customPriceSchema, createInput],
    ['update', () => updateSchema, updateInput],
  ])('%s: rejects a note over 500 characters with "Note must be 500 characters or fewer."', (_label, getSchema, buildInput) => {
    const messages = messagesFor(getSchema(), { ...buildInput(), notes: 'x'.repeat(501) }, 'notes');
    expect(messages).toEqual([NOTE_TOO_LONG]);
  });

  it('create requires customerId and productId', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { customerId, productId, ...rest } = createInput();
    const result = customPriceSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  // F-06 (T32): the custom-price schema had no upper bound and no 2dp rule, per
  // contracts/server-actions.md §createCustomPrice ("price: number; > 0, ≤ 99 999 999.99, 2 dp").
  // A too-large value used to reach the DB and fail as FAILED instead of a field error.
  const MAX_AMOUNT = 99_999_999.99;

  it.each([
    ['create', () => customPriceSchema, createInput],
    ['update', () => updateSchema, updateInput],
  ])('%s: rejects a price above the maximum with "Price is too large."', (_label, getSchema, buildInput) => {
    const messages = messagesFor(getSchema(), { ...buildInput(), price: MAX_AMOUNT + 0.01 }, 'price');
    expect(messages).toEqual(['Price is too large.']);
  });

  it.each([
    ['create', () => customPriceSchema, createInput],
    ['update', () => updateSchema, updateInput],
  ])('%s: accepts the maximum price boundary', (_label, getSchema, buildInput) => {
    const result = getSchema().safeParse({ ...buildInput(), price: MAX_AMOUNT });
    expect(result.success).toBe(true);
  });

  it.each([
    ['create', () => customPriceSchema, createInput],
    ['update', () => updateSchema, updateInput],
  ])('%s: rejects a price with more than 2 decimal places', (_label, getSchema, buildInput) => {
    const messages = messagesFor(getSchema(), { ...buildInput(), price: 1.004 }, 'price');
    expect(messages).toEqual(['Price can have at most 2 decimal places.']);
  });
});
