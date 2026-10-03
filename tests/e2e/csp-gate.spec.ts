// T20 (spec.md §5 AC-20, QG-3) — the release gate: with the content-security policy enforced, the
// core flows complete with zero policy violations. Runs against the local production build, or a
// preview deploy when BASE_URL is set. The session comes from the real Sign-in link flow
// (support/genuine-session.ts). Google sign-in needs a real Google account and is covered by the
// user's preview run (ship-notes.md); the Sign-in link, chart, invoice PDF preview + download +
// print, a client-side error, settings (avatar), logo / customer-image previews, the data export,
// the legal pages are covered here (the landing page redirects a signed-in user, so the data-free describe checks it signed out). Every other private page is covered by the
// genuine-session sweep in route-sweep.spec.ts, which attaches the same collector.
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { skipWithoutContainerRuntime } from './support/require-container-runtime';
import { APP_E2E_URL, BASE_URL_OVERRIDE } from './support/app-server';
import {
  collectCspViolations,
  type CspCollector,
} from './support/csp-collector';
import { signInWithSignInLink } from './support/genuine-session';
import { seedWorkspace, type SeededWorkspace } from './support/seed';
import { uniqueTestEmail } from '../support/factories/ids';
import {
  authRoutes,
  legalRoutes,
  protectedRoutes,
  publicRoutes,
} from '../../config/routes.config';

const ON_PREVIEW = Boolean(BASE_URL_OVERRIDE);
// A preview has the real Sentry DSN, so the tunnel must answer 200; the local build has none.
const SENTRY_CONFIGURED = ON_PREVIEW || process.env.E2E_EXPECT_SENTRY === '1';

// Throws a client-side error on the open page and checks what the tunnel answers.
async function throwClientErrorThroughTunnel(page: Page) {
  const throwError = () =>
    page.evaluate(() =>
      setTimeout(() => {
        throw new Error('T20 synthetic client error');
      }, 0)
    );
  if (SENTRY_CONFIGURED) {
    const tunnel = page.waitForResponse(
      (r) => r.url().endsWith('/monitoring') && r.request().method() === 'POST'
    );
    await throwError();
    expect((await tunnel).status()).toBe(200);
  } else {
    // No DSN on the local build: the tunnel refuses (403) and nothing is forwarded.
    await throwError();
    const refused = await page.evaluate(
      async () =>
        (await fetch('/monitoring', { method: 'POST', body: '{}' })).status
    );
    expect(refused).toBe(403);
  }
}

// The flows that need no seeded data, so they also run against a preview deploy (BASE_URL), where
// the Given of AC-20 holds. A preview additionally has the real DSN, so the tunnel must answer 200.
test.describe('AC-20 CSP release gate — data-free public flows (also on preview)', () => {
  let context: BrowserContext;
  let page: Page;
  let csp: CspCollector;

  test.beforeAll(async ({ browser }, testInfo) => {
    if (!ON_PREVIEW) await skipWithoutContainerRuntime(testInfo);
    context = await browser.newContext();
    csp = await collectCspViolations(context);
    page = await context.newPage();
  });

  test.afterAll(async () => {
    await context?.close();
  });

  for (const path of [
    authRoutes.signIn,
    publicRoutes.landing,
    ...Object.values(legalRoutes),
  ]) {
    test(`${path} opens with zero violations`, async () => {
      await page.goto(`${APP_E2E_URL}${path}`);
      expect(new URL(page.url()).pathname).toBe(path);
      await page.waitForLoadState('networkidle');
      csp.expectNone(`public page ${path}`);
    });
  }

  test('a client-side error is tunnelled (/monitoring answers 200 on preview) without a violation', async () => {
    await page.goto(`${APP_E2E_URL}${authRoutes.signIn}`);
    await throwClientErrorThroughTunnel(page);
    csp.expectNone('client-side error on the sign-in page');
  });
});

test.describe.configure({ mode: 'default', timeout: 150_000 });

test.describe('AC-20 CSP release gate — core flows complete with zero policy violations', () => {
  let context: BrowserContext;
  let page: Page;
  let csp: CspCollector;
  let workspace: SeededWorkspace;
  const email = uniqueTestEmail('csp-gate');

  test.beforeAll(async ({ browser }, testInfo) => {
    test.setTimeout(240_000);
    await skipWithoutContainerRuntime(testInfo);
    test.skip(
      ON_PREVIEW,
      'seeded data needs the local throwaway database; the public flows above run on preview'
    );
    workspace = await seedWorkspace(email);
    context = await browser.newContext();
    csp = await collectCspViolations(context);
    page = await context.newPage();
    // Signed in once per worker, so a failing flow never leaves the later ones without a session.
    await signInWithSignInLink(page, email);
    csp.expectNone('sign in by Sign-in link');
  });

  // Every flow opens its page directly: a bounce to sign-in would make "zero violations" vacuous.
  async function open(path: string) {
    await page.goto(`${APP_E2E_URL}${path}`);
    expect(new URL(page.url()).pathname, `${path} must open directly`).toBe(
      path
    );
  }

  test.afterAll(async () => {
    await context?.close();
  });

  test('the Sign-in link flow left a genuine session on a private page', async () => {
    await expect(page).not.toHaveURL(/\/(login|error|verify-request)/);
  });

  test('dashboard chart renders', async () => {
    await open(protectedRoutes.dashboard);
    await expect(page.locator('.recharts-wrapper').first()).toBeVisible({
      timeout: 30_000,
    });
    csp.expectNone('dashboard chart');
  });

  test('invoice PDF: preview, download and print', async () => {
    await open(protectedRoutes.invoiceEdit(workspace.invoiceId));
    // The editor's live preview (zoom controls) is the PDF preview panel.
    await expect(page.locator('.lucide-zoom-in').first()).toBeAttached({
      timeout: 60_000,
    });
    csp.expectNone('invoice PDF preview');

    const download = page.waitForEvent('download', { timeout: 90_000 });
    download.catch(() => undefined); // a violation fails the flow first; no unhandled rejection
    await page.getByRole('button', { name: 'Download PDF' }).click();
    expect(
      (await csp.waitFor('invoice PDF download', download)).suggestedFilename()
    ).toMatch(/\.pdf$/i);
    csp.expectNone('invoice PDF download');

    // The print flow opens the PDF in a popup and calls window.print(); headless Chromium's modal
    // print dialog would block the popup forever, so stub it — the CSP check is unaffected.
    await page.context().addInitScript(() => {
      window.print = () => undefined;
    });
    const popup = page.waitForEvent('popup', { timeout: 90_000 });
    popup.catch(() => undefined);
    await page.getByRole('button', { name: 'Print', exact: true }).click();
    // The popup shows the generated PDF in Chromium's built-in viewer, which exposes neither a URL
    // nor a `load` event headlessly — the popup opening is the flow's success signal; then give
    // violation events a moment to arrive.
    await csp.waitFor('invoice PDF print', popup);
    await page.waitForTimeout(3_000);
    csp.expectNone('invoice PDF print');
  });

  test('a client-side error is tunnelled without a violation', async () => {
    await open(protectedRoutes.dashboard);
    await throwClientErrorThroughTunnel(page);
    csp.expectNone('client-side error');
  });

  test('settings: profile avatar and privacy page', async () => {
    await open(protectedRoutes.settingsProfile);
    await expect(
      page.locator('img, [data-slot="avatar"]').first()
    ).toBeAttached();
    csp.expectNone('settings profile');
    await open(protectedRoutes.settingsPrivacy);
    await expect(
      page.getByRole('button', { name: /Export My Data/i })
    ).toBeVisible();
    csp.expectNone('settings privacy');
  });

  test('logo and customer-image previews', async () => {
    for (const path of [
      protectedRoutes.senderProfileDetail(workspace.senderProfileId),
      // The edit index redirects to its first tab; open the tab itself.
      protectedRoutes.senderProfileEditTab(workspace.senderProfileId),
      protectedRoutes.customerDetail(workspace.customerId),
      protectedRoutes.customerEdit(workspace.customerId),
    ]) {
      await open(path);
      await page.waitForLoadState('networkidle');
      csp.expectNone(`image previews ${path}`);
    }
  });

  test('data export', async () => {
    await open(protectedRoutes.settingsPrivacy);
    const download = page.waitForEvent('download', { timeout: 30_000 });
    await page.getByRole('button', { name: /Export My Data/i }).click();
    await download;
    csp.expectNone('data export');
  });

  test('legal pages', async () => {
    for (const path of Object.values(legalRoutes)) {
      await open(path);
      await page.waitForLoadState('networkidle');
      csp.expectNone(`public page ${path}`);
    }
  });
});
