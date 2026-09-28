// T34 (spec.md §5 AC-05, review-2026-09-27 F-12) — test-plan.md row "every non-public built
// route denies a request without a cookie" (e2e): a sweep over every route in the built route
// manifest, through the real app entry point (the proxy included), with no session cookie.
// Pages redirect to sign-in; data routes and server actions are refused as UNAUTHORIZED with no
// data; only the deliberately public set (config/routes.config.ts) returns content.
//
// Runs against the second webServer (playwright.config.ts, start-app-server.mjs) — a production
// build of the real app on a throwaway Postgres container, never the static harness page the
// smoke spec uses. Uses Playwright's `request` API context directly (no browser/JS needed to
// observe an HTTP redirect or a JSON refusal body) with `maxRedirects: 0`, so a 307/302's own
// Location header is asserted instead of following it.
import { test, expect } from '@playwright/test';
import { skipWithoutContainerRuntime } from './support/require-container-runtime';
import { APP_E2E_URL } from './support/app-server';
import {
  protectedRoutes,
  protectedRoutesArray,
  publicRoutesArray,
  authRoutesArray,
  legalRoutesArray,
} from '../../config/routes.config';

const FAKE_ID = 'route-sweep-fake-id-0000000001';

// Every private page path the built app actually has (config/routes.config.ts's own roots, plus
// the concrete nested/dynamic ones — a prefix match on any of the roots below already covers
// them at the proxy, but each is still requested for real so a future proxy regression that
// narrowed the prefix match would be caught here too).
const PROTECTED_PAGE_PATHS = [
  ...protectedRoutesArray,
  protectedRoutes.settingsProfile,
  protectedRoutes.settingsPrivacy,
  protectedRoutes.senderProfilesNew,
  protectedRoutes.senderProfileDetail(FAKE_ID),
  protectedRoutes.senderProfileEdit(FAKE_ID),
  protectedRoutes.customersNew,
  protectedRoutes.customerDetail(FAKE_ID),
  protectedRoutes.customerEdit(FAKE_ID),
  protectedRoutes.productsNew,
  protectedRoutes.productEdit(FAKE_ID),
  protectedRoutes.productCustomPrices(FAKE_ID),
  protectedRoutes.invoicesNew,
  protectedRoutes.invoiceEdit(FAKE_ID),
];

// Every app/api/* route the app actually built, other than next-auth's own handler (which must
// stay public — it's how a session gets created).
const DATA_ROUTE_PATHS = ['/api/convert-image', '/api/user/export'];

// The deliberately public set (config/routes.config.ts isPublicPath) — a request with no cookie
// must return real content, not a refusal.
const ALLOWLISTED_GET_PATHS = [
  ...publicRoutesArray,
  ...authRoutesArray,
  ...legalRoutesArray,
  '/favicon.ico',
  '/robots.txt',
  '/sitemap.xml',
  '/manifest.json',
  '/opengraph-image',
  '/twitter-image',
  '/icon.png',
  '/icon.svg',
  '/apple-icon.png',
];

test.describe('AC-05 route sweep — every built non-public route denies a cookie-less request', () => {
  test.beforeEach(async ({}, testInfo) => {
    await skipWithoutContainerRuntime(testInfo);
  });

  for (const path of PROTECTED_PAGE_PATHS) {
    test(`page ${path} redirects to sign-in with no session`, async ({ playwright }) => {
      const context = await playwright.request.newContext({ maxRedirects: 0 });
      try {
        const response = await context.get(`${APP_E2E_URL}${path}`);

        expect([302, 307]).toContain(response.status());
        const location = response.headers()['location'];
        expect(location).toBeTruthy();
        expect(new URL(location!, APP_E2E_URL).pathname).toBe('/login');
      } finally {
        await context.dispose();
      }
    });
  }

  for (const path of DATA_ROUTE_PATHS) {
    test(`data route ${path} is refused as not signed in, with no data`, async ({ playwright }) => {
      const context = await playwright.request.newContext();
      try {
        const response = await context.post(`${APP_E2E_URL}${path}`, { data: {} });

        expect(response.status()).toBe(401);
        const body = await response.json();
        expect(body).toEqual({ success: false, code: 'UNAUTHORIZED', error: 'Not signed in.' });
      } finally {
        await context.dispose();
      }
    });
  }

  test('a server action (Next-Action header) with no session is refused with no data', async ({ playwright }) => {
    const context = await playwright.request.newContext();
    try {
      const response = await context.post(`${APP_E2E_URL}${protectedRoutes.dashboard}`, {
        headers: { 'Next-Action': 'route-sweep-fake-action-id' },
        data: {},
      });

      expect(response.status()).toBe(401);
      const body = await response.json();
      expect(body).toEqual({ success: false, code: 'UNAUTHORIZED', error: 'Not signed in.' });
    } finally {
      await context.dispose();
    }
  });

  for (const path of ALLOWLISTED_GET_PATHS) {
    test(`allowlisted ${path} returns content with no session`, async ({ playwright }) => {
      const context = await playwright.request.newContext({ maxRedirects: 0 });
      try {
        const response = await context.get(`${APP_E2E_URL}${path}`);

        expect(response.status()).toBeGreaterThanOrEqual(200);
        expect(response.status()).toBeLessThan(400);
      } finally {
        await context.dispose();
      }
    });
  }

  test('an unseen path (added in the future, not on the allowlist) still denies by default', async ({
    playwright,
  }) => {
    const context = await playwright.request.newContext({ maxRedirects: 0 });
    try {
      const response = await context.get(`${APP_E2E_URL}/api/a-route-nobody-listed-yet`);

      expect(response.status()).toBe(401);
      const body = await response.json();
      expect(body).toEqual({ success: false, code: 'UNAUTHORIZED', error: 'Not signed in.' });
    } finally {
      await context.dispose();
    }
  });
});
