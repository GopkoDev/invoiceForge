// AC-19: where sign-in sends the browser afterwards. A path or an address on this app is
// followed; the app's own address is both the request's origin (baseUrl) and the configured public
// origin (AUTH_URL), which differ when the server sees itself under another host name.
import { describe, expect, it } from 'vitest';
import { authRedirectTarget } from '@/lib/auth/redirect-target';

const BASE = 'http://localhost:4311';
const PUBLIC = 'http://127.0.0.1:4311';

describe('authRedirectTarget', () => {
  it('turns a path into an address on the base origin', () => {
    expect(authRedirectTarget('/invoices/a/edit', BASE, PUBLIC)).toBe(
      `${BASE}/invoices/a/edit`
    );
  });

  it('follows an address on the base origin', () => {
    expect(authRedirectTarget(`${BASE}/invoices/a/edit`, BASE, PUBLIC)).toBe(
      `${BASE}/invoices/a/edit`
    );
  });

  it('follows an address on the configured public origin', () => {
    expect(authRedirectTarget(`${PUBLIC}/invoices/a/edit`, BASE, PUBLIC)).toBe(
      `${PUBLIC}/invoices/a/edit`
    );
  });

  it('sends any other origin to the base origin', () => {
    expect(
      authRedirectTarget('https://evil.example/invoices', BASE, PUBLIC)
    ).toBe(BASE);
  });

  it('sends an unparsable address to the base origin', () => {
    expect(authRedirectTarget('not a url', BASE, PUBLIC)).toBe(BASE);
  });

  it('works with no configured public origin', () => {
    expect(authRedirectTarget(`${PUBLIC}/x`, BASE, undefined)).toBe(BASE);
    expect(authRedirectTarget(`${BASE}/x`, BASE, undefined)).toBe(`${BASE}/x`);
  });
});
