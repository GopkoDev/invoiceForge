// AC-04: safeReturnPath must validate the NORMALISED
// value. `new URL('/.//evil.com', origin).pathname` is `//evil.com`, which as an href is an
// off-site, protocol-relative link.
import { describe, expect, it } from 'vitest';
import { safeReturnPath } from '@/lib/helpers/return-path';

const ORIGIN = 'https://app.example.com';
const REFERER = { allowAbsoluteSameOrigin: true };

describe('safeReturnPath', () => {
  it.each([
    '/.//evil.com',
    '/%2e%2e//evil.com',
    '/a/..//evil.com',
    '//evil.com',
    '/api/',
    '/api/auth/session',
    '/%2e%2e/api/auth/session',
    '/\\evil.com',
    'https://evil.com/x',
  ])('rejects %s', (raw) => {
    expect(safeReturnPath(raw, ORIGIN)).toBeNull();
  });

  it.each([
    `${ORIGIN}/.//evil.com`,
    `${ORIGIN}/%2e%2e//evil.com`,
    'https://evil.com/dashboard',
    `${ORIGIN}/api/auth/session`,
  ])('rejects the Referer form %s', (raw) => {
    expect(safeReturnPath(raw, ORIGIN, REFERER)).toBeNull();
  });

  it('keeps a plain same-origin path with its query', () => {
    expect(safeReturnPath('/invoices?page=2', ORIGIN)).toBe('/invoices?page=2');
    expect(safeReturnPath(`${ORIGIN}/invoices?x=1`, ORIGIN, REFERER)).toBe('/invoices?x=1');
  });

  it('returns null for empty input', () => {
    expect(safeReturnPath(null, ORIGIN)).toBeNull();
    expect(safeReturnPath('', ORIGIN)).toBeNull();
  });
});
