// T03 (spec.md §5 AC-02, AC-07; ADR-0004) — Personal key format: ifk_ + 43 base62 secret chars +
// 6 base62 checksum chars, stored only as a lower-case hex SHA-256 digest plus the last four chars.
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  digestKey,
  generatePersonalKey,
  isWellFormedKey,
} from '@/lib/services/personal-keys/key-format';

const PATTERN = /^ifk_[0-9A-Za-z]{49}$/;
const ALPHABET =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

describe('generatePersonalKey', () => {
  it('produces 53-char keys matching the contract pattern that pass the checksum', () => {
    for (let i = 0; i < 300; i++) {
      const { fullKey } = generatePersonalKey();
      expect(fullKey).toHaveLength(53);
      expect(fullKey).toMatch(PATTERN);
      expect(isWellFormedKey(fullKey)).toBe(true);
    }
  });

  it('returns lastFour as the last four characters and digest as lower-case hex SHA-256', () => {
    const { fullKey, digest, lastFour } = generatePersonalKey();
    expect(lastFour).toBe(fullKey.slice(-4));
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).toBe(digestKey(fullKey));
  });

  it('generates distinct keys', () => {
    const keys = new Set(
      Array.from({ length: 100 }, () => generatePersonalKey().fullKey)
    );
    expect(keys.size).toBe(100);
  });
});

describe('digestKey', () => {
  it('matches a known SHA-256 answer', () => {
    expect(digestKey(`ifk_${'A'.repeat(49)}`)).toBe(
      '0b009cccc08f032a9f6dd5c8eb49943ee11a01792e6fb4a2c88b58a779228140'
    );
  });
});

describe('isWellFormedKey', () => {
  it('fails the checksum when any single character changes', () => {
    const { fullKey } = generatePersonalKey();
    for (let pos = 4; pos < fullKey.length; pos++) {
      const original = fullKey[pos];
      const replacement = ALPHABET[(ALPHABET.indexOf(original) + 1) % 62];
      const mutated =
        fullKey.slice(0, pos) + replacement + fullKey.slice(pos + 1);
      expect(isWellFormedKey(mutated)).toBe(false);
    }
  });

  it('rejects empty, wrong prefix, wrong length, non-base62, whitespace and non-string input', () => {
    const { fullKey } = generatePersonalKey();
    const body = fullKey.slice(4);
    const bad: unknown[] = [
      '',
      `IFK_${body}`,
      `ifx_${body}`,
      body,
      fullKey.slice(0, -1),
      `${fullKey}A`,
      `${fullKey.slice(0, -1)}-`,
      `${fullKey.slice(0, -1)}_`,
      ` ${fullKey}`,
      `${fullKey} `,
      `${fullKey}\n`,
      'x'.repeat(100_000),
      null,
      undefined,
      42,
      {},
      [fullKey],
      Symbol('k'),
    ];
    for (const input of bad) {
      expect(() => isWellFormedKey(input)).not.toThrow();
      expect(isWellFormedKey(input)).toBe(false);
    }
  });
});
