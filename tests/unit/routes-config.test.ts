// AC-05: exactly one publicRoutes allowlist, and an isPublicPath(pathname) helper that decides
// whether a path is reachable without a session. Anything not on this list is private by
// default, including paths added later (e.g. a hypothetical `/reports`).
import { readFileSync } from 'node:fs';
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
    '/web-app-manifest-192x192.png', // F-26: referenced by app/manifest.json
    '/web-app-manifest-512x512.png',
    '/api/cron/purge-limits', // T15: Vercel Cron carries no session; guarded by its bearer secret
  ])('allows the deliberately public path %s', (path) => {
    expect(isPublicPath(path)).toBe(true);
  });

  // F-25: only the next-auth endpoints that actually exist are listed, not the whole
  // `/api/auth/` prefix, so a future route added under it is private by default.
  it.each([
    '/api/auth',
    '/api/auth/session',
    '/api/auth/csrf',
    '/api/auth/providers',
    '/api/auth/signin',
    '/api/auth/signin/google',
    '/api/auth/signout',
    '/api/auth/callback/google',
    '/api/auth/error',
    '/api/auth/verify-request',
    '/api/auth/clear-session', // this app's own route, not next-auth's, but must stay public
  ])('allows the known next-auth endpoint %s', (path) => {
    expect(isPublicPath(path)).toBe(true);
  });

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
    '/api/auth/some-future-endpoint', // F-25: not a listed next-auth path
    '/api/auth/clear-session-admin', // F-25: not the real clear-session path
    '/api/cron', // T15: only the purge job itself is public, not the cron prefix
    '/api/cron/purge-limits/extra',
    '/api/cron/other-job',
  ])('denies the private/unknown path %s by default', (path) => {
    expect(isPublicPath(path)).toBe(false);
  });
});

describe('vercel.json crons (T15, ADR-0007)', () => {
  it('schedules the purge-limits route daily', () => {
    const config = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
      crons?: { path: string; schedule: string }[];
    };
    const entry = config.crons?.find((c) => c.path === '/api/cron/purge-limits');
    expect(entry).toBeDefined();
    // five-field cron with fixed minute and hour, every day: "m h * * *"
    expect(entry?.schedule).toMatch(/^\d{1,2} \d{1,2} \* \* \*$/);
  });
});
