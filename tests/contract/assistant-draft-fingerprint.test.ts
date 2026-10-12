// T16 (ai-assistant; ADR-0007, ADR-0012): fingerprintRequest is the lower-case hex SHA-256 of the
// canonical (key-sorted, trimmed) request, so equal requests always give the same fingerprint.
import { describe, expect, it } from 'vitest';
import { fingerprintRequest } from '@/lib/services/assistant-drafts/fingerprint';

const base = {
  customer: 'Acme',
  currency: 'USD',
  lines: [{ description: 'consulting', quantity: '20', unit: 'hours', price: '50' }],
};

describe('fingerprintRequest (T16)', () => {
  it('is a 64-character lower-case hex string', async () => {
    expect(await fingerprintRequest(base)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is stable for equal requests', async () => {
    expect(await fingerprintRequest(structuredClone(base))).toBe(await fingerprintRequest(base));
  });

  it('ignores key order, at every depth', async () => {
    const reordered = {
      lines: [{ price: '50', unit: 'hours', quantity: '20', description: 'consulting' }],
      currency: 'USD',
      customer: 'Acme',
    };
    expect(await fingerprintRequest(reordered)).toBe(await fingerprintRequest(base));
  });

  it('ignores surrounding whitespace in text values', async () => {
    const padded = {
      ...base,
      customer: '  Acme ',
      lines: [{ description: ' consulting  ', quantity: '20', unit: 'hours', price: '50' }],
    };
    expect(await fingerprintRequest(padded)).toBe(await fingerprintRequest(base));
  });

  it('differs when a value differs, and when the line order differs', async () => {
    const dearer = { ...base, lines: [{ ...base.lines[0], price: '60' }] };
    expect(await fingerprintRequest(dearer)).not.toBe(await fingerprintRequest(base));
    const two = { ...base, lines: [{ description: 'a', price: '1' }, { description: 'b', price: '2' }] };
    const swapped = { ...base, lines: [two.lines[1], two.lines[0]] };
    expect(await fingerprintRequest(swapped)).not.toBe(await fingerprintRequest(two));
  });
});
