// T8 - limit keys (AC-12, AC-13; sad.md §8 Limit keys, TD-1).
//
// Seam assumed (lib/security/limits/keys.ts, not yet created); the secret is read from
// process.env.LIMIT_KEY_SECRET at call time:
//   foldAddress(email: string): string
//   addressLimitKey(email: string): string   // lower-hex HMAC-SHA256(secret, foldAddress(email))
//   sourceLimitKey(ip: string): string       // lower-hex HMAC-SHA256(secret, IPv4 | IPv6 /64 prefix)
import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addressLimitKey,
  foldAddress,
  sourceLimitKey,
} from '@/lib/security/limits/keys';

const SECRET = 'unit-test-limit-key-secret';
const hmac = (v: string) =>
  createHmac('sha256', SECRET).update(v).digest('hex');

describe('limit keys (T8)', () => {
  let previous: string | undefined;
  beforeAll(() => {
    previous = process.env.LIMIT_KEY_SECRET;
    process.env.LIMIT_KEY_SECRET = SECRET;
  });
  afterAll(() => {
    if (previous === undefined) delete process.env.LIMIT_KEY_SECRET;
    else process.env.LIMIT_KEY_SECRET = previous;
  });

  describe('foldAddress', () => {
    it('folds letter case', () => {
      expect(foldAddress('John.Doe@Example.COM')).toBe('john.doe@example.com');
    });
    it('strips a +tag from the local part', () => {
      expect(foldAddress('john+invoices@example.com')).toBe('john@example.com');
    });
    it('strips dots in the local part for gmail.com and googlemail.com', () => {
      expect(foldAddress('u.s.e.r+x@gmail.com')).toBe('user@gmail.com');
      expect(foldAddress('U.ser@googlemail.com')).toBe('user@googlemail.com');
    });
    it('keeps dots for non-Gmail domains', () => {
      expect(foldAddress('john.doe@example.com')).toBe('john.doe@example.com');
    });
  });

  describe('addressLimitKey', () => {
    it('groups every spelling of one Gmail mailbox', () => {
      expect(addressLimitKey('User@Gmail.com')).toBe(
        addressLimitKey('u.s.e.r+x@gmail.com')
      );
    });
    it('keeps john.doe and johndoe apart on a non-Gmail domain', () => {
      expect(addressLimitKey('john.doe@example.com')).not.toBe(
        addressLimitKey('johndoe@example.com')
      );
    });
    it('is the lower-hex HMAC-SHA256 of the folded address and never the raw value', () => {
      const key = addressLimitKey('User+tag@Example.com');
      expect(key).toMatch(/^[0-9a-f]{64}$/);
      expect(key).toBe(hmac('user@example.com'));
      expect(key).not.toContain('example');
    });
  });

  describe('sourceLimitKey', () => {
    it('digests an IPv4 address as-is', () => {
      const key = sourceLimitKey('203.0.113.7');
      expect(key).toMatch(/^[0-9a-f]{64}$/);
      expect(key).toBe(hmac('203.0.113.7'));
      expect(key).not.toContain('203.0.113.7');
    });
    it('gives two IPv6 addresses in one /64 the same key', () => {
      expect(sourceLimitKey('2001:db8:1:2:aaaa::1')).toBe(
        sourceLimitKey('2001:0db8:0001:0002:bbbb:cccc:dddd:eeee')
      );
    });
    it('gives IPv6 addresses in different /64 networks different keys', () => {
      expect(sourceLimitKey('2001:db8:1:2::1')).not.toBe(
        sourceLimitKey('2001:db8:1:3::1')
      );
    });
    it('gives different IPv4 addresses different keys', () => {
      expect(sourceLimitKey('203.0.113.7')).not.toBe(
        sourceLimitKey('203.0.113.8')
      );
    });
  });
});
