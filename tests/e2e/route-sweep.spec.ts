// T34 (spec.md §5 AC-05, review-2026-09-27 F-12) — test-plan.md row "every non-public built
// route denies a request without a cookie" (e2e): a sweep over every route in the built route
// manifest, through the real app entry point (the proxy included), with no session cookie.
// Pages redirect to sign-in; data routes and server actions are refused as UNAUTHORIZED with no
// data; only the deliberately public set (config/routes.config.ts) returns content.
//
// T44 (review-2026-09-28 N-02): the route list is the built manifest itself, not a hand-kept
// array; allowlisted paths must return exactly 200 with no redirect; route handlers are called
// with the method they really export.
//
// Runs against the second webServer (playwright.config.ts, start-app-server.mjs) — a production
// build of the real app on a throwaway Postgres container, never the static harness page the
// smoke spec uses. Uses Playwright's `request` API context directly (no browser/JS needed to
// observe an HTTP redirect or a JSON refusal body) with `maxRedirects: 0`, so a 307/302's own
// Location header is asserted instead of following it.
import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { skipWithoutContainerRuntime } from './support/require-container-runtime';
import { isNextAuthCatchAll, type BuiltRoute } from './support/route-sweep-exclusion';
import { APP_E2E_URL } from './support/app-server';
import { authRoutes, isPublicPath, protectedRoutes } from '../../config/routes.config';

const FAKE_ID = 'route-sweep-fake-id-0000000001';
const REPO_ROOT = process.cwd(); // Playwright runs from the repo root (playwright.config.ts lives there)

// The manifest the production build itself emits (.next/app-path-routes-manifest.json, written
// by the second webServer's `next build`). Read inside the tests, not at import time, because
// the build only exists once the webServer is up. Keys are app-dir entries
// ("/(protected)/customers/[id]/page"), values the URL path ("/customers/[id]").

function readBuiltRoutes(): BuiltRoute[] {
  const manifestPath = path.join(REPO_ROOT, '.next', 'app-path-routes-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Record<string, string>;
  return (
    Object.entries(manifest)
      .map(([entry, urlPath]) => ({
        entry,
        urlPath,
        kind: (entry.endsWith('/route') ? 'route' : 'page') as BuiltRoute['kind'],
      }))
      // Next's own internal entries (/_not-found, /_global-error) are not app routes.
      .filter((route) => !route.urlPath.startsWith('/_'))
  );
}

// Dynamic segments (and a catch-all's) are filled with a fake id.
function concretePath(urlPath: string): string {
  return urlPath.replace(/\[\.\.\.[^\]]+\]/g, FAKE_ID).replace(/\[[^\]]+\]/g, FAKE_ID);
}

// next-auth's catch-all handler owns many public endpoints (config/routes.config.ts lists them
// explicitly); a fake segment under it says nothing, so it is left out of both sweeps. Only this
// one route is excluded: any other catch-all stays in the sweep (R-12).

// Route handlers are called with the method they really export, read from the source file.
function exportedMethods(entry: string): string[] {
  const source = fs.readFileSync(path.join(REPO_ROOT, 'app', `${entry}.ts`), 'utf8');
  const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].filter((method) =>
    new RegExp(`export\\s+(async\\s+)?function\\s+${method}\\b`).test(source)
  );
  expect(methods, `${entry} exports no recognised HTTP method`).not.toHaveLength(0);
  return methods;
}

const UNAUTHORIZED_BODY = { success: false, code: 'UNAUTHORIZED', error: 'Not signed in.' };

// Public paths whose handler is a redirect by design (the stale-cookie sweeper 302s to sign-in).
const PUBLIC_REDIRECTS: Record<string, string> = { '/api/auth/clear-session': authRoutes.signIn };

test.describe('AC-05 route sweep — every built non-public route denies a cookie-less request', () => {
  test.beforeEach(async ({}, testInfo) => {
    await skipWithoutContainerRuntime(testInfo);
  });

  test('the manifest is read and includes the nested routes the old hand list missed', async () => {
    const urlPaths = readBuiltRoutes().map((route) => route.urlPath);

    expect(urlPaths).toContain(protectedRoutes.senderProfileEditTab('[id]'));
    expect(urlPaths).toContain(protectedRoutes.senderProfileEditBankAccounts('[id]'));
  });

  test('the sweep exclusion matches exactly one manifest entry', async () => {
    const excluded = readBuiltRoutes().filter(isNextAuthCatchAll);

    expect(excluded).toHaveLength(1);
  });

  test('every protected built path is denied with no session (pages redirect, handlers 401)', async ({
    playwright,
  }) => {
    const protectedInBuild = readBuiltRoutes().filter(
      (route) => !isNextAuthCatchAll(route) && !isPublicPath(concretePath(route.urlPath))
    );
    expect(protectedInBuild.length).toBeGreaterThan(0);
    const context = await playwright.request.newContext({ maxRedirects: 0 });
    try {
      for (const route of protectedInBuild) {
        const url = `${APP_E2E_URL}${concretePath(route.urlPath)}`;
        if (route.kind === 'page') {
          const response = await context.get(url);
          expect([302, 307], `page ${route.urlPath}`).toContain(response.status());
          const location = response.headers()['location'];
          expect(location, `page ${route.urlPath} location`).toBeTruthy();
          expect(new URL(location!, APP_E2E_URL).pathname, `page ${route.urlPath}`).toBe(authRoutes.signIn);
        } else {
          for (const method of exportedMethods(route.entry)) {
            const response = await context.fetch(url, { method, ...(method === 'GET' ? {} : { data: {} }) });
            expect(response.status(), `${method} ${route.urlPath}`).toBe(401);
            expect(await response.json(), `${method} ${route.urlPath}`).toEqual(UNAUTHORIZED_BODY);
          }
        }
      }
    } finally {
      await context.dispose();
    }
  });

  test('every allowlisted built path returns 200 with no redirect to sign-in', async ({ playwright }) => {
    const publicInBuild = readBuiltRoutes().filter(
      (route) => !isNextAuthCatchAll(route) && isPublicPath(concretePath(route.urlPath))
    );
    expect(publicInBuild.length).toBeGreaterThan(0);
    const context = await playwright.request.newContext({ maxRedirects: 0 });
    try {
      for (const route of publicInBuild) {
        const response = await context.get(`${APP_E2E_URL}${concretePath(route.urlPath)}`);
        const redirectTarget = PUBLIC_REDIRECTS[route.urlPath];
        if (redirectTarget) {
          expect(response.status(), route.urlPath).toBe(302);
          expect(new URL(response.headers()['location']!, APP_E2E_URL).pathname, route.urlPath).toBe(redirectTarget);
        } else {
          expect(response.status(), route.urlPath).toBe(200);
          expect(response.headers()['location'], `${route.urlPath} must not redirect`).toBeUndefined();
        }
      }
    } finally {
      await context.dispose();
    }
  });

  test('a server action (Next-Action header) with no session is refused with no data', async ({ playwright }) => {
    const context = await playwright.request.newContext();
    try {
      const response = await context.post(`${APP_E2E_URL}${protectedRoutes.dashboard}`, {
        headers: { 'Next-Action': 'route-sweep-fake-action-id' },
        data: {},
      });

      expect(response.status()).toBe(401);
      expect(await response.json()).toEqual(UNAUTHORIZED_BODY);
    } finally {
      await context.dispose();
    }
  });

  test('an unseen path (added in the future, not on the allowlist) still denies by default', async ({
    playwright,
  }) => {
    const context = await playwright.request.newContext({ maxRedirects: 0 });
    try {
      const response = await context.get(`${APP_E2E_URL}/api/a-route-nobody-listed-yet`);

      expect(response.status()).toBe(401);
      expect(await response.json()).toEqual(UNAUTHORIZED_BODY);
    } finally {
      await context.dispose();
    }
  });
});
