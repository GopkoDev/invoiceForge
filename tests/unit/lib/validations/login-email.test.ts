// AC-17: one shared address rule.
import { describe, expect, it } from 'vitest';
import { loginEmailSchema } from '@/lib/validations/auth';

const MESSAGE = 'Enter a valid email address.';
const ofLength = (n: number) =>
  `${'a'.repeat(n - '@example.test'.length)}@example.test`;

describe('loginEmailSchema (AC-17)', () => {
  it.each([
    ['a plain address', 'ana@example.test', true],
    ['254 characters', ofLength(254), true],
    ['255 characters', ofLength(255), false],
    ['a non-ASCII local part', 'ünal@example.test', false],
    ['a non-ASCII domain', 'ana@exämple.test', false],
    ['empty', '', false],
    ['not an address', 'not-an-address', false],
  ])('%s', (_label, email, ok) => {
    expect(loginEmailSchema.safeParse({ email }).success).toBe(ok);
  });

  it.each([ofLength(255), 'ünal@example.test', 'not-an-address'])(
    'refuses %s with the single fixed message',
    (email) => {
      const result = loginEmailSchema.safeParse({ email });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.map((i) => i.message)).toEqual([MESSAGE]);
      }
    }
  );
});
