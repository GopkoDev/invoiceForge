// invoice-integrity T13 (spec.md §5 AC-20) — a product's price follows the custom-price rule: a
// number with at most two decimal places, not negative, at most 99,999,999.99; "" stays "Price is
// required". contracts/server-actions.md §Products.
import { describe, expect, it } from 'vitest';
import { productFormSchema } from '@/lib/validations/product';

const form = (price: string) => ({
  name: 'Consulting',
  unit: 'hour',
  price,
  currency: 'USD',
  isActive: true,
});

function priceErrors(price: string): string[] | undefined {
  const result = productFormSchema.safeParse(form(price));
  return result.success ? undefined : result.error.flatten().fieldErrors.price;
}

describe('productFormSchema.price (AC-20)', () => {
  it.each([
    ['12abc', 'Price must be a number.'],
    ['abc', 'Price must be a number.'],
    ['12.345', 'Price can have at most 2 decimal places.'],
    ['-1', "Price can't be negative."],
    ['100000000', 'Price is too large.'],
    ['', 'Price is required'],
    // T25 (review F5): the contract shape ^\d{1,8}(\.\d{1,2})?$ on the raw string.
    [' ', 'Price must be a number.'],
    ['0x10', 'Price must be a number.'],
    ['0b11', 'Price must be a number.'],
    ['1e3', 'Price must be a number.'],
    [' 12.00 ', 'Price must be a number.'],
  ])('refuses %j with %j', (price, message) => {
    expect(priceErrors(price)).toEqual([message]);
  });

  it.each(['12.34', '12.3', '0', '99999999.99'])('accepts %j', (price) => {
    expect(productFormSchema.safeParse(form(price)).success).toBe(true);
  });
});

describe('productFormSchema.price yields the validated number (T25, F5)', () => {
  it.each([
    ['12.3', 12.3],
    ['0', 0],
    ['150.00', 150],
    ['99999999.99', 99999999.99],
  ])('turns %j into %j', (price, expected) => {
    const result = productFormSchema.safeParse(form(price));
    expect(result.success && result.data.price).toBe(expected);
  });
});
