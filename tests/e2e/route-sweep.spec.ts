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
import { test, expect, type BrowserContext } from '@playwright/test';
import { skipWithoutContainerRuntime } from './support/require-container-runtime';
import {
  isNextAuthCatchAll,
  type BuiltRoute,
} from './support/route-sweep-exclusion';
import {
  APP_E2E_URL,
  BASE_URL_OVERRIDE,
  BROKEN_CHECK_URL,
} from './support/app-server';
import {
  collectCspViolations,
  type CspCollector,
} from './support/csp-collector';
import { signInWithSignInLink } from './support/genuine-session';
import { seedWorkspace, type SeededWorkspace } from './support/seed';
import { uniqueTestEmail } from '../support/factories/ids';
import {
  PURGE_LIMITS_CRON_PATH,
  authRoutes,
  isPublicPath,
  protectedRoutes,
} from '../../config/routes.config';

const FAKE_ID = 'route-sweep-fake-id-0000000001';
const REPO_ROOT = process.cwd(); // Playwright runs from the repo root (playwright.config.ts lives there)

// The manifest the production build itself emits (.next/app-path-routes-manifest.json, written
// by the second webServer's `next build`). Read inside the tests, not at import time, because
// the build only exists once the webServer is up. Keys are app-dir entries
// ("/(protected)/customers/[id]/page"), values the URL path ("/customers/[id]").

function readBuiltRoutes(): BuiltRoute[] {
  const manifestPath = path.join(
    REPO_ROOT,
    '.next',
    'app-path-routes-manifest.json'
  );
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Record<
    string,
    string
  >;
  return (
    Object.entries(manifest)
      .map(([entry, urlPath]) => ({
        entry,
        urlPath,
        kind: (entry.endsWith('/route')
          ? 'route'
          : 'page') as BuiltRoute['kind'],
      }))
      // Next's own internal entries (/_not-found, /_global-error) are not app routes.
      .filter((route) => !route.urlPath.startsWith('/_'))
  );
}

// Dynamic segments (and a catch-all's) are filled with a fake id.
function concretePath(urlPath: string): string {
  return urlPath
    .replace(/\[\.\.\.[^\]]+\]/g, FAKE_ID)
    .replace(/\[[^\]]+\]/g, FAKE_ID);
}

// next-auth's catch-all handler owns many public endpoints (config/routes.config.ts lists them
// explicitly); a fake segment under it says nothing, so it is left out of both sweeps. Only this
// one route is excluded: any other catch-all stays in the sweep (R-12).

// Route handlers are called with the method they really export, read from the source file.
function exportedMethods(entry: string): string[] {
  const source = fs.readFileSync(
    path.join(REPO_ROOT, 'app', `${entry}.ts`),
    'utf8'
  );
  const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].filter((method) =>
    new RegExp(`export\\s+(async\\s+)?function\\s+${method}\\b`).test(source)
  );
  expect(
    methods,
    `${entry} exports no recognised HTTP method`
  ).not.toHaveLength(0);
  return methods;
}

// Route handlers that are public on purpose and guard themselves, so a cookie-less call gets their
// own refusal rather than the proxy's UNAUTHORIZED: the Sentry tunnel refuses every envelope when
// the build has no DSN (AC-22).
const SELF_GUARDED_HANDLERS: Record<string, number> = { '/monitoring': 403 };

const UNAUTHORIZED_BODY = {
  success: false,
  code: 'UNAUTHORIZED',
  error: 'Not signed in.',
};

// Public paths whose handler is a redirect by design (the stale-cookie sweeper 302s to sign-in).
// The purge cron is public to the proxy (Vercel Cron carries no session) and guards itself with the
// CRON_SECRET bearer: without it, 401 and nothing purged (ADR-0007).
const PUBLIC_REFUSALS: Record<string, number> = {
  [PURGE_LIMITS_CRON_PATH]: 401,
};

const PUBLIC_REDIRECTS: Record<string, string> = {
  '/api/auth/clear-session': authRoutes.signIn,
};

test.describe('AC-05 route sweep — every built non-public route denies a cookie-less request', () => {
  test.beforeEach(async ({}, testInfo) => {
    await skipWithoutContainerRuntime(testInfo);
  });

  test('the manifest is read and includes the nested routes the old hand list missed', async () => {
    const urlPaths = readBuiltRoutes().map((route) => route.urlPath);

    expect(urlPaths).toContain(protectedRoutes.senderProfileEditTab('[id]'));
    expect(urlPaths).toContain(
      protectedRoutes.senderProfileEditBankAccounts('[id]')
    );
  });

  test('the sweep exclusion matches exactly one manifest entry', async () => {
    const excluded = readBuiltRoutes().filter(isNextAuthCatchAll);

    expect(excluded).toHaveLength(1);
  });

  test('every protected built path is denied with no session (pages redirect, handlers 401)', async ({
    playwright,
  }) => {
    const protectedInBuild = readBuiltRoutes().filter(
      (route) =>
        !isNextAuthCatchAll(route) && !isPublicPath(concretePath(route.urlPath))
    );
    expect(protectedInBuild.length).toBeGreaterThan(0);
    const context = await playwright.request.newContext({ maxRedirects: 0 });
    try {
      for (const route of protectedInBuild) {
        const url = `${APP_E2E_URL}${concretePath(route.urlPath)}`;
        if (route.kind === 'page') {
          const response = await context.get(url);
          expect([302, 307], `page ${route.urlPath}`).toContain(
            response.status()
          );
          const location = response.headers()['location'];
          expect(location, `page ${route.urlPath} location`).toBeTruthy();
          expect(
            new URL(location!, APP_E2E_URL).pathname,
            `page ${route.urlPath}`
          ).toBe(authRoutes.signIn);
        } else {
          const selfGuardedStatus = SELF_GUARDED_HANDLERS[route.urlPath];
          for (const method of exportedMethods(route.entry)) {
            const response = await context.fetch(url, {
              method,
              ...(method === 'GET' ? {} : { data: {} }),
            });
            if (selfGuardedStatus) {
              expect(response.status(), `${method} ${route.urlPath}`).toBe(
                selfGuardedStatus
              );
              continue;
            }
            expect(response.status(), `${method} ${route.urlPath}`).toBe(401);
            expect(await response.json(), `${method} ${route.urlPath}`).toEqual(
              UNAUTHORIZED_BODY
            );
          }
        }
      }
    } finally {
      await context.dispose();
    }
  });

  test('every allowlisted built path returns 200 with no redirect to sign-in', async ({
    playwright,
  }) => {
    const publicInBuild = readBuiltRoutes().filter(
      (route) =>
        !isNextAuthCatchAll(route) && isPublicPath(concretePath(route.urlPath))
    );
    expect(publicInBuild.length).toBeGreaterThan(0);
    const context = await playwright.request.newContext({ maxRedirects: 0 });
    try {
      for (const route of publicInBuild) {
        const response = await context.get(
          `${APP_E2E_URL}${concretePath(route.urlPath)}`
        );
        const redirectTarget = PUBLIC_REDIRECTS[route.urlPath];
        if (redirectTarget) {
          expect(response.status(), route.urlPath).toBe(302);
          expect(
            new URL(response.headers()['location']!, APP_E2E_URL).pathname,
            route.urlPath
          ).toBe(redirectTarget);
        } else if (PUBLIC_REFUSALS[route.urlPath]) {
          expect(response.status(), route.urlPath).toBe(
            PUBLIC_REFUSALS[route.urlPath]
          );
        } else {
          expect(response.status(), route.urlPath).toBe(200);
          expect(
            response.headers()['location'],
            `${route.urlPath} must not redirect`
          ).toBeUndefined();
        }
      }
    } finally {
      await context.dispose();
    }
  });

  test('a server action (Next-Action header) with no session is refused with no data', async ({
    playwright,
  }) => {
    const context = await playwright.request.newContext();
    try {
      const response = await context.post(
        `${APP_E2E_URL}${protectedRoutes.dashboard}`,
        {
          headers: { 'Next-Action': 'route-sweep-fake-action-id' },
          data: {},
        }
      );

      expect(response.status()).toBe(401);
      expect(await response.json()).toEqual(UNAUTHORIZED_BODY);
    } finally {
      await context.dispose();
    }
  });

  // AC-18: the other request shapes. A real, non-sign-in action id comes from the build's own
  // server-reference manifest, so the framework would really dispatch it if the request got that far.
  function readNonSignInActionId(): string {
    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(
          REPO_ROOT,
          '.next',
          'server',
          'server-reference-manifest.json'
        ),
        'utf8'
      )
    ) as {
      node: Record<string, { filename: string; exportedName: string }>;
    };
    const entry = Object.entries(manifest.node).find(
      ([, action]) => action.filename === 'lib/actions/customer-actions.ts'
    );
    expect(entry, 'a customer action in the manifest').toBeTruthy();
    return entry![0];
  }

  test('a header-less JSON POST to a private page is refused with no data', async ({
    playwright,
  }) => {
    const context = await playwright.request.newContext();
    try {
      const response = await context.post(
        `${APP_E2E_URL}${protectedRoutes.dashboard}`,
        { data: {} }
      );

      expect(response.status()).toBe(401);
      expect(await response.json()).toEqual(UNAUTHORIZED_BODY);
    } finally {
      await context.dispose();
    }
  });

  test('a form-encoded POST naming an action is refused with no data', async ({
    playwright,
  }) => {
    const context = await playwright.request.newContext();
    try {
      const actionId = readNonSignInActionId();
      for (const target of [
        protectedRoutes.dashboard,
        protectedRoutes.customers,
      ]) {
        const response = await context.post(`${APP_E2E_URL}${target}`, {
          form: { [`$ACTION_ID_${actionId}`]: '' },
        });

        expect(response.status(), target).toBe(401);
        expect(await response.json(), target).toEqual(UNAUTHORIZED_BODY);
      }
    } finally {
      await context.dispose();
    }
  });

  test('POST /login naming a non-sign-in action is refused and the action does not run', async ({
    playwright,
  }) => {
    const context = await playwright.request.newContext();
    try {
      const actionId = readNonSignInActionId();
      const header = await context.post(`${APP_E2E_URL}${authRoutes.signIn}`, {
        headers: { 'Next-Action': actionId },
        data: '[]',
      });
      // The action never runs: the page it was posted to does not own it (an inert `{}`), or it
      // refuses itself through its own session guard. Either way no data comes back.
      const inertOrRefused = (body: string) =>
        body === '{}' || body.includes('UNAUTHORIZED');
      expect(header.status()).toBeLessThan(500);
      const headerBody = await header.text();
      expect(inertOrRefused(headerBody), headerBody).toBe(true);
      expect(headerBody).not.toContain('"success":true');

      const form = await context.post(`${APP_E2E_URL}${authRoutes.signIn}`, {
        form: { [`$ACTION_ID_${actionId}`]: '' },
      });
      expect(form.status()).toBeLessThan(500);
      expect(await form.text()).not.toContain('"success":true');
    } finally {
      await context.dispose();
    }
  });

  test('an unseen path (added in the future, not on the allowlist) still denies by default', async ({
    playwright,
  }) => {
    const context = await playwright.request.newContext({ maxRedirects: 0 });
    try {
      const response = await context.get(
        `${APP_E2E_URL}/api/a-route-nobody-listed-yet`
      );

      expect(response.status()).toBe(401);
      expect(await response.json()).toEqual(UNAUTHORIZED_BODY);
    } finally {
      await context.dispose();
    }
  });
});

// T20 (AC-02, AC-05): the other half of the sweep — a Freelancer holding a genuine session, issued
// by the real Sign-in link flow (support/genuine-session.ts, never a hand-built cookie), reaches
// every private page directly and is never bounced to sign-in.
test.describe('AC-05 route sweep — a genuine session reaches every private page', () => {
  test.describe.configure({ mode: 'serial' });
  let context: BrowserContext;
  let csp: CspCollector;
  let workspace: SeededWorkspace;

  test.beforeAll(async ({ browser }, testInfo) => {
    test.setTimeout(240_000);
    await skipWithoutContainerRuntime(testInfo);
    test.skip(
      !!BASE_URL_OVERRIDE,
      'seeded data needs the local throwaway database; the user runs the preview checklist'
    );
    const email = uniqueTestEmail('sweep');
    workspace = await seedWorkspace(email);
    context = await browser.newContext();
    // AC-20: the same sweep also proves no private page breaks the enforced content-security policy.
    csp = await collectCspViolations(context);
    await signInWithSignInLink(await context.newPage(), email);
  });

  test.afterAll(async () => {
    await context?.close();
  });

  // Dynamic segments take the seeded record's real id, chosen by the section the path lives in.
  function withSeededIds(urlPath: string): string {
    const id = urlPath.startsWith('/sender-profiles/')
      ? workspace.senderProfileId
      : urlPath.startsWith('/customers/')
        ? workspace.customerId
        : urlPath.startsWith('/products/')
          ? workspace.productId
          : workspace.invoiceId;
    return urlPath.replace(/\[\.\.\.[^\]]+\]/g, id).replace(/\[[^\]]+\]/g, id);
  }

  // Private pages whose handler is an in-app redirect by design (the settings index opens the
  // profile tab); any other landing path, sign-in above all, fails the sweep.
  const PRIVATE_REDIRECTS: Record<string, (path: string) => string> = {
    '/settings': () => protectedRoutes.settingsProfile,
    '/sender-profiles/[id]/edit': (path) =>
      protectedRoutes.senderProfileEditTab(path.split('/')[2]),
  };

  test('every private page loads directly with no redirect to sign-in and zero CSP violations', async () => {
    // One fresh tab per private page: well over the 30 s default when the suite runs in parallel.
    test.setTimeout(240_000);
    const privatePages = readBuiltRoutes().filter(
      (route) =>
        route.kind === 'page' && !isPublicPath(concretePath(route.urlPath))
    );
    expect(privatePages.length).toBeGreaterThan(0);
    for (const route of privatePages) {
      // A fresh tab per page: a client-side redirect still in flight must not abort the next goto().
      const page = await context.newPage();
      const path = withSeededIds(route.urlPath);
      const response = await page.goto(`${APP_E2E_URL}${path}`);
      const redirectTarget = PRIVATE_REDIRECTS[route.urlPath]?.(path);
      // A server-component redirect() can complete client-side after goto() resolves.
      if (redirectTarget) await page.waitForURL(`**${redirectTarget}`);
      expect(
        new URL(page.url()).pathname,
        `${route.urlPath} must not bounce to sign-in`
      ).toBe(redirectTarget ?? path);
      expect(response?.status(), route.urlPath).toBeLessThan(400);
      await page.waitForLoadState('networkidle');
      csp.expectNone(`private page ${route.urlPath}`);
      await page.close();
    }
  });
});

// T21 (spec.md §5 AC-04, AC-06; review-2026-10-03 F-02, F-03, F-04) — test-plan.md rows "failed
// sign-in check never ends an existing session" and "sign-in and landing pages render without a
// redirect loop" (e2e). The check is made to fail for real: BROKEN_CHECK_URL is the same build and
// database booted with a different AUTH_SECRET (start-app-server.mjs), the misconfiguration AC-04
// names. Cookies are scoped to the host, not the port, so the session issued by the real server is
// the one that fails there, and "the check recovers" is simply going back to the real server.
test.describe('AC-04 / AC-06 — a failing sign-in check never ends a session', () => {
  test.describe.configure({ mode: 'serial' });
  let context: BrowserContext;

  // The twin is not part of Playwright's webServer readiness check, so wait for it here.
  async function waitForBrokenCheckServer(): Promise<void> {
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      try {
        await fetch(BROKEN_CHECK_URL, { redirect: 'manual' });
        return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    throw new Error(`${BROKEN_CHECK_URL} did not come up within 60s`);
  }

  function sessionCookieExpiries(headers: { name: string; value: string }[]) {
    return headers.filter(
      (h) =>
        h.name.toLowerCase() === 'set-cookie' &&
        /^(__Secure-)?authjs\.session-token(\.\d+)?=;/.test(h.value)
    );
  }

  async function sessionCookieValue(): Promise<string | undefined> {
    const cookies = await context.cookies(APP_E2E_URL);
    return cookies.find((c) => /authjs\.session-token/.test(c.name))?.value;
  }

  test.beforeAll(async ({ browser }, testInfo) => {
    test.setTimeout(240_000);
    await skipWithoutContainerRuntime(testInfo);
    test.skip(
      !!BASE_URL_OVERRIDE,
      'the misconfigured twin server only exists for the local run'
    );
    await waitForBrokenCheckServer();
    context = await browser.newContext();
    await signInWithSignInLink(
      await context.newPage(),
      uniqueTestEmail('check-fails')
    );
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test('AC-04: while the check fails a private page goes to sign-in and data is refused; once it recovers the same cookie opens the dashboard', async () => {
    // The dashboard render runs alongside the private-page sweep above: past the 30 s default.
    test.setTimeout(120_000);
    const before = await sessionCookieValue();
    expect(before, 'the real sign-in flow left a session cookie').toBeTruthy();

    const pageResponse = await context.request.get(
      `${BROKEN_CHECK_URL}${protectedRoutes.dashboard}`,
      { maxRedirects: 0 }
    );
    expect(pageResponse.status()).toBeGreaterThanOrEqual(300);
    expect(pageResponse.status()).toBeLessThan(400);
    expect(
      new URL(pageResponse.headers()['location']!, BROKEN_CHECK_URL).pathname
    ).toBe(authRoutes.signIn);
    expect(sessionCookieExpiries(pageResponse.headersArray())).toEqual([]);

    const dataResponse = await context.request.get(
      `${BROKEN_CHECK_URL}/api/user/export`,
      { maxRedirects: 0 }
    );
    expect(dataResponse.status()).toBe(401);
    expect(await dataResponse.json()).toEqual(UNAUTHORIZED_BODY);
    expect(sessionCookieExpiries(dataResponse.headersArray())).toEqual([]);

    expect(
      await sessionCookieValue(),
      'a failed check must not touch the session cookie'
    ).toBe(before);

    const page = await context.newPage();
    const recovered = await page.goto(
      `${APP_E2E_URL}${protectedRoutes.dashboard}`
    );
    expect(new URL(page.url()).pathname).toBe(protectedRoutes.dashboard);
    expect(recovered?.status()).toBeLessThan(400);
    await page.close();
  });

  // T31 (re-review R-01): the requests above are made one by one; a real browser loading a page
  // also runs whatever the page's scripts fetch once they hydrate (a client session poller would
  // call /api/auth/session, whose own failed check clears the cookie). So: the genuine cookie, a
  // real page load on the failing server, every request settled, and the cookie is still there.
  test('AC-04: hydrated sign-in and public pages on the failing server leave the genuine cookie untouched', async () => {
    test.setTimeout(120_000);
    const before = await sessionCookieValue();
    expect(before, 'the real sign-in flow left a session cookie').toBeTruthy();

    const page = await context.newPage();
    const expiries: string[] = [];
    page.on('response', async (response) => {
      for (const header of sessionCookieExpiries(
        await response.headersArray()
      )) {
        expiries.push(`${response.url()}: ${header.value}`);
      }
    });
    for (const path of [authRoutes.signIn, '/', '/privacy']) {
      const response = await page.goto(`${BROKEN_CHECK_URL}${path}`);
      expect(response?.status(), path).toBe(200);
      await page.waitForLoadState('networkidle');
      expect(new URL(page.url()).pathname, path).toBe(path);
    }
    expect(expiries, 'no response may expire the session cookie').toEqual([]);
    expect(
      await sessionCookieValue(),
      'a failed check in the browser must not touch the session cookie'
    ).toBe(before);

    const recovered = await page.goto(
      `${APP_E2E_URL}${protectedRoutes.dashboard}`
    );
    expect(new URL(page.url()).pathname).toBe(protectedRoutes.dashboard);
    expect(recovered?.status()).toBeLessThan(400);
    await page.close();
  });

  test('AC-06: the sign-in and landing pages render in one response while the check fails, and sign-in works once it recovers', async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    for (const path of [authRoutes.signIn, '/']) {
      const response = await context.request.get(`${BROKEN_CHECK_URL}${path}`, {
        maxRedirects: 0,
      });
      expect(response.status(), path).toBe(200);
      expect(response.headers()['location'], path).toBeUndefined();
      expect(sessionCookieExpiries(response.headersArray()), path).toEqual([]);
    }

    // A Visitor in a real browser: carrying a cookie the check cannot verify, the pages still
    // settle on themselves (no redirect chain, client-side or otherwise).
    const visitor = await browser.newContext();
    try {
      await visitor.addCookies([
        {
          name: 'authjs.session-token',
          value: 'a-token-this-server-cannot-verify',
          url: BROKEN_CHECK_URL,
        },
      ]);
      const page = await visitor.newPage();
      for (const path of [authRoutes.signIn, '/']) {
        const response = await page.goto(`${BROKEN_CHECK_URL}${path}`);
        expect(response?.status(), path).toBe(200);
        await page.waitForLoadState('networkidle');
        expect(new URL(page.url()).pathname, path).toBe(path);
      }

      await signInWithSignInLink(page, uniqueTestEmail('check-recovers'));
    } finally {
      await visitor.close();
    }
  });
});
