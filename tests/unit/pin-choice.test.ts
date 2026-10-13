// ai-chat-v2 T10 (ADR-0003, server-actions.md §Chat route internals, Pins): a pressed option is written into the
// stored request by code. Pure; the input is never mutated.
import { describe, expect, it } from 'vitest';
import { pinChoice } from '@/lib/services/assistant-drafts/pin';
import type { DraftRequest } from '@/lib/services/assistant-drafts/schema';

const base = (): DraftRequest => ({
  customer: 'Acme',
  senderProfile: 'Main',
  bankAccount: 'mono',
  currency: 'USD',
  lines: [
    { description: 'Design', quantity: '2', price: '50' },
    { description: 'Code', quantity: '1', price: '100' },
  ],
});

describe('pinChoice', () => {
  it('CUSTOMER sets customerId and drops the customer text', () => {
    const out = pinChoice(base(), 'CUSTOMER', null, { customerId: 'c2' });
    expect(out.customerId).toBe('c2');
    expect(out).not.toHaveProperty('customer');
    expect(out.lines).toEqual(base().lines);
  });

  it('SENDER_PROFILE sets senderProfileId and drops senderProfile', () => {
    const out = pinChoice(base(), 'SENDER_PROFILE', null, { senderProfileId: 's2' });
    expect(out.senderProfileId).toBe('s2');
    expect(out).not.toHaveProperty('senderProfile');
    expect(out.customer).toBe('Acme');
  });

  it('CURRENCY sets the currency code', () => {
    expect(pinChoice(base(), 'CURRENCY', null, { currency: 'EUR' }).currency).toBe('EUR');
  });

  it('BANK_ACCOUNT sets bankAccount to the account id', () => {
    expect(pinChoice(base(), 'BANK_ACCOUNT', null, { bankAccountId: 'b2' }).bankAccount).toBe('b2');
  });

  it('PRODUCT sets productId on the named line only', () => {
    const out = pinChoice(base(), 'PRODUCT', 1, { productId: 'p9' });
    expect(out.lines[1]).toEqual({ description: 'Code', quantity: '1', price: '100', productId: 'p9' });
    expect(out.lines[0]).toEqual(base().lines[0]);
    expect(out.lines).toHaveLength(2);
  });

  it('does not mutate the input request', () => {
    const input = base();
    const snapshot = structuredClone(input);
    pinChoice(input, 'CUSTOMER', null, { customerId: 'c2' });
    pinChoice(input, 'PRODUCT', 0, { productId: 'p1' });
    expect(input).toEqual(snapshot);
  });

  it('a request that already carried customerId stays valid when pinned again', () => {
    const out = pinChoice({ customerId: 'c1', lines: base().lines }, 'CUSTOMER', null, { customerId: 'c2' });
    expect(out.customerId).toBe('c2');
    expect(out).not.toHaveProperty('customer');
  });
});
