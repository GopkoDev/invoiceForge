import { describe, expect, it } from 'vitest';
import { computeInvoiceAmounts, lineAmount } from '@/lib/helpers/invoice-calculations';

// AC-13: line total is quantity x price rounded half up to 2 places, exact decimal, no float
// drift; subtotal is the sum of the rounded lines and tax is rounded once.
describe('lineAmount (AC-13, exact half-up rounding)', () => {
  it.each([
    ['0.005', '1', '0.01'],
    ['1.005', '1', '1.01'],
    ['2.675', '1', '2.68'],
    ['0.1', '3', '0.30'],
    ['33.335', '1', '33.34'],
  ])('quantity %s x price %s -> %s', (quantity, price, expected) => {
    expect(lineAmount(quantity, price)).toBe(expected);
  });

  it('has no float drift for 0.1 + 0.2 style inputs', () => {
    // 0.1 x 3 as a naive float multiply is 0.30000000000000004; the exact-decimal module must
    // not reproduce that artefact.
    expect(lineAmount('0.1', '3')).toBe('0.30');
  });

  // F-07: numbers small enough that JS's Number#toString() renders them in exponent form (e.g.
  // 1e-7) used to make parseDecimal's BigInt(unscaledStr) throw a SyntaxError instead of
  // returning a value — the server then surfaced FAILED instead of VALIDATION, and the editor's
  // onChange crashed. lineAmount/computeInvoiceAmounts must accept exponent-form numbers.
  it('does not throw on a number given in exponent form', () => {
    expect(() => lineAmount(1e-7, 1)).not.toThrow();
    expect(() => lineAmount('1e-7', '1')).not.toThrow();
  });

  it('parses exponent-form numbers to their exact decimal value', () => {
    // 1e-2 = 0.01, rounded to 2dp is itself.
    expect(lineAmount('1e-2', '1')).toBe('0.01');
    // 1e-7 is far below the cent, so it rounds down to 0.00.
    expect(lineAmount('1e-7', '1')).toBe('0.00');
    // Large positive exponent.
    expect(lineAmount('1.5e2', '1')).toBe('150.00');
  });
});

describe('computeInvoiceAmounts (AC-13, editor/server parity)', () => {
  it('sums rounded line amounts into the subtotal and rounds tax once', () => {
    const result = computeInvoiceAmounts({
      items: [
        { quantity: '1', price: '1.005' }, // -> 1.01
        { quantity: '3', price: '0.1' }, // -> 0.30
      ],
      discount: '0',
      shipping: '0',
      taxRate: '10',
    });

    // subtotal = 1.01 + 0.30 = 1.31
    expect(result.items.map((item) => item.amount)).toEqual(['1.01', '0.30']);
    expect(result.subtotal).toBe('1.31');
    // taxAmount = round_half_up(1.31 * 0.10, 2) = 0.13
    expect(result.taxAmount).toBe('0.13');
    expect(result.total).toBe('1.44');
  });

  it('ignores browser-sent totals and is unaffected by discount equal to subtotal plus shipping', () => {
    const result = computeInvoiceAmounts({
      items: [{ quantity: '2', price: '50' }],
      discount: '110',
      shipping: '10',
      taxRate: '0',
    });

    // subtotal 100, shipping 10 -> base for discount cap is 110; discount == 110 -> total 0.00
    expect(result.subtotal).toBe('100.00');
    expect(result.total).toBe('0.00');
  });
});
