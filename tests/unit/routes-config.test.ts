// AC-05: exactly one publicRoutes allowlist, and an isPublicPath(pathname) helper that decides
// whether a path is reachable without a session. Anything not on this list is private by
// default, including paths added later (e.g. a hypothetical `/reports`).
import { describe, expect, it } from 'vitest';
import { isPublicPath } from '@/config/routes.config';

describe('isPublicPath (AC-05, deny-by-default allowlist)', () => {
  it.each([
    '/',
    '/login',
    '/verify-request',
    '/error',
    '/privacy',
    '/terms',
    '/robots.txt',
    '/sitemap.xml',
    '/manifest.json',
    '/opengraph-image',
    '/twitter-image',
    '/icon',
    '/apple-icon',
  ])('allows the deliberately public path %s', (path) => {
    expect(isPublicPath(path)).toBe(true);
  });

  it.each(['/api/auth/session', '/api/auth/signin/google', '/api/auth/callback/google'])(
    'allows the next-auth handler prefix %s',
    (path) => {
      expect(isPublicPath(path)).toBe(true);
    }
  );

  it.each([
    '/dashboard',
    '/invoices',
    '/invoices/x/edit',
    '/sender-profiles',
    '/customers',
    '/products',
    '/settings',
    '/api/convert-image',
    '/api/user/export',
    '/some-new-path', // AC-05: private by default even though nothing else has ever seen it
    '/reports', // edge case table: a page added after this change
    '/iconography', // a later page that merely starts with an icon file name stays private
    '/apple-icons-admin',
  ])('denies the private/unknown path %s by default', (path) => {
    expect(isPublicPath(path)).toBe(false);
  });
});
