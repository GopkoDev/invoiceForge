// T57 (review r4 P5; spec.md §5 AC-07, AC-08): the Freelancer's first navigation after signing in
// is not lost. Before T57 the private layout's TimeZoneCookie wrote the `tz` cookie on the first
// private page and called router.refresh(). In WebKit a navigation started during that refresh
// cancelled its RSC fetch ("Load failed"), Next.js answered with a full load of /dashboard, and the
// Freelancer's navigation was interrupted ("interrupted by another navigation to /dashboard").
// Now the sign-in pages write the cookie (without a refresh), so the landing page has nothing to
// refresh. This spec signs in through the real UI WITHOUT the harness's old wait for that refresh
// and navigates to an editor address the moment the refresh goes out (or, when none does, as soon
// as the landing page has hydrated). Runs in the chromium and webkit projects (playwright.config.ts);
// WebKit is the browser that cancelled the fetch.
import { test, expect, type Page, type Request } from '@playwright/test';
import { requestSignInLink } from './support/genuine-session';
import { allowPlainHttpOnWebKit } from './support/signed-in';
import { skipWithoutContainerRuntime } from './support/require-container-runtime';
import { APP_E2E_URL } from './support/app-server';
import { uniqueTestEmail } from '../support/factories/ids';
import { protectedRoutes } from '../../config/routes.config';

test.describe.configure({ timeout: 180_000 });

/** A router.refresh() fetch: an RSC request that is neither a prefetch nor a server action. */
function isRouterRefresh(request: Request): boolean {
  const headers = request.headers();
  return headers['rsc'] === '1' && !headers['next-router-prefetch'] && !headers['next-action'];
}

/** Resolves once React has hydrated the page (it attaches a `__reactFiber$…` key to hydrated nodes). */
async function pageHydrated(page: Page): Promise<void> {
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll('body *')).some((el) =>
      Object.keys(el).some((k) => k.startsWith('__reactFiber$'))
    )
  );
}

test('the first navigation after sign-in reaches the editor, with no time-zone refresh to cancel it', async ({
  browser,
}, testInfo) => {
  await skipWithoutContainerRuntime(testInfo);
  // A zone far from UTC, so a missing or stale cookie would matter to the server.
  const context = await browser.newContext({ timezoneId: 'Pacific/Auckland' });
  await allowPlainHttpOnWebKit(browser, context);
  const page = await context.newPage();

  const link = await requestSignInLink(page, uniqueTestEmail('first-nav'));

  const landingRefreshes: string[] = [];
  let refreshSent: () => void = () => {};
  const sent = new Promise<void>((resolve) => (refreshSent = resolve));
  const onRequest = (request: Request) => {
    if (!isRouterRefresh(request)) return;
    landingRefreshes.push(request.url());
    refreshSent();
  };
  page.on('request', onRequest);

  await page.goto(link);
  await expect(page, 'the Sign-in link must land on the dashboard').toHaveURL(/\/dashboard/);
  // A Freelancer who clicks at once: navigate the moment a refresh goes out, or once hydrated.
  await Promise.race([sent, pageHydrated(page)]);

  const editor = `${APP_E2E_URL}${protectedRoutes.invoicesNew}`;
  await page.goto(editor);
  page.off('request', onRequest);
  await expect(page, 'the navigation must not be replaced by a load of /dashboard').toHaveURL(editor);
  await expect(page.locator('h1.truncate')).toBeVisible();
  // Stay a moment: a late full load of /dashboard (the old failure) would move the page away.
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveURL(editor);

  expect(
    landingRefreshes,
    'the landing page must not refresh: the sign-in pages already wrote the tz cookie'
  ).toEqual([]);
  const tz = (await page.context().cookies(APP_E2E_URL)).find((c) => c.name === 'tz');
  expect(tz?.value).toBe('Pacific/Auckland');
  await context.close();
});
