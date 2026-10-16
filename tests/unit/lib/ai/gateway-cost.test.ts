import { describe, expect, it } from 'vitest';
import { gatewayCostOf, sumCosts } from '@/lib/ai/gateway-cost';

// T91 (review 2026-10-15 F5, ADR-0014): on paid terms a call with no reported cost is unknown (null), never free (0).
const meta = (cost: unknown) => ({ gateway: { cost } });

describe('gatewayCostOf', () => {
  it('parses a valid decimal string', () => {
    expect(gatewayCostOf(meta('0.000150'))).toBeCloseTo(0.00015, 9);
  });

  it('keeps a reported 0 as 0 (a known, free call)', () => {
    expect(gatewayCostOf(meta('0'))).toBe(0);
  });

  it.each([
    ['undefined metadata', undefined],
    ['no gateway key', {}],
    ['no cost', { gateway: {} }],
    ['a non-numeric string', meta('abc')],
    ['an empty string', meta('')],
    ['a non-finite value', meta('Infinity')],
    ['NaN', meta(Number.NaN)],
    ['a negative value', meta('-0.5')],
    ['a non-string non-number', meta({})],
  ])('returns null for %s', (_name, input) => {
    expect(gatewayCostOf(input)).toBeNull();
  });
});

describe('sumCosts', () => {
  it('rounds the sum of known costs to six decimals', () => {
    expect(sumCosts([0.00002, 0.0001, 0.00005])).toBe(0.00017);
  });

  it('returns null when any call cost is unknown', () => {
    expect(sumCosts([0.00002, null, 0.00005])).toBeNull();
  });

  it('returns null when every call cost is unknown', () => {
    expect(sumCosts([null])).toBeNull();
  });
});
