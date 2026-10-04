// AC-19: the page a Visitor asked for is where sign-in returns, but only ever a path on this app.
import { describe, expect, it } from 'vitest';
import { signInReturnPath } from '@/lib/auth/sign-in-return-path';

describe('signInReturnPath', () => {
  it('keeps a private path', () => {
    expect(signInReturnPath('/invoices/abc123/edit')).toBe(
      '/invoices/abc123/edit'
    );
  });

  it.each([
    ['nothing', undefined],
    ['an empty value', ''],
    ['an absolute URL', 'https://evil.example/invoices'],
    ['a protocol-relative URL', '//evil.example/invoices'],
    ['a backslash host', '/\\evil.example'],
    ['a path without a leading slash', 'invoices/abc'],
    ['a control character', '/invoices/a\nb'],
    ['an array', ['/invoices']],
  ])('falls back to the landing path for %s', (_label, value) => {
    expect(signInReturnPath(value)).toBe('/');
  });

  it.each(['/login', '/login?callbackUrl=%2Fx', '/verify-request', '/error'])(
    'never returns to the sign-in pages (%s)',
    (value) => {
      expect(signInReturnPath(value)).toBe('/');
    }
  );
});
