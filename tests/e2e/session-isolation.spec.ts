// AC-07 (test-plan.md e2e row, sad.md §10): A had an invoice open, signed out, B signed in in the
// same tab. Moving Back/Forward, no frame ever shows A's invoice number; A's invoice address
// shows B "Invoice Not Found". Runs in the chromium and webkit projects (playwright.config.ts).
import { test, expect, type Page } from '@playwright/test';
import { openSignedInFreelancer } from './support/signed-in';
import { signInWithSignInLink } from './support/genuine-session';
import { seedWorkspace } from './support/seed';
import { openEditor } from './support/invoice-ui';
import { APP_E2E_URL } from './support/app-server';
import { uniqueTestEmail } from '../support/factories/ids';
import { protectedRoutes } from '../../config/routes.config';

test.describe.configure({ timeout: 300_000 });

/** Ends the session the way the app's Log out does: Auth.js CSRF-protected POST to /api/auth/signout. */
async function signOut(page: Page): Promise<void> {
  const { csrfToken } = await (
    await page.context().request.get(`${APP_E2E_URL}/api/auth/csrf`)
  ).json();
  await page.context().request.post(`${APP_E2E_URL}/api/auth/signout`, {
    form: { csrfToken },
  });
}

test('AC-07: B never sees A\'s invoice through sign-out, sign-in, Back and Forward', async ({
  browser,
}, testInfo) => {
  test.setTimeout(300_000);
  const a = await openSignedInFreelancer(browser, testInfo, 'se-a');
  try {
    const { page, context } = a;
    const number = a.workspace.invoiceNumber;

    // Every painted frame is checked in the page itself (init script survives bfcache restores);
    // a frame counts only while the document is not hidden by the restore guard.
    const leaks: string[] = [];
    await context.exposeFunction('__reportLeak', (where: string) => {
      leaks.push(where);
    });
    await context.addInitScript((needle: string) => {
      const tick = () => {
        const hidden =
          document.documentElement.style.visibility === 'hidden' ||
          document.visibilityState === 'hidden';
        if (!hidden && document.body && document.body.innerText.includes(needle)) {
          (window as unknown as { __reportLeak: (w: string) => void }).__reportLeak(
            location.pathname
          );
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      // A restored page has no new navigation: pageshow re-arms the same loop's output.
    }, number);

    await openEditor(page, a.workspace.invoiceId);
    await expect(page.locator('body')).toContainText(number);
    leaks.length = 0; // A seeing A's own invoice is expected

    await signOut(page);

    // A Visitor pressing Back/Forward sees none of A's data and is sent to sign in.
    await page.goto(`${APP_E2E_URL}/login`);
    // A's own page was still on screen until the navigation: reports in flight from it don't count.
    await page.waitForTimeout(500);
    leaks.length = 0;
    await page.goBack();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator('body')).not.toContainText(number);
    await page.goForward();
    await page.goBack();
    await expect(page).toHaveURL(/\/login/);
    expect(leaks, 'A\'s number showed to a Visitor').toEqual([]);

    // B signs in, same tab.
    const emailB = uniqueTestEmail('se-b');
    await seedWorkspace(emailB);
    await signInWithSignInLink(page, emailB);
    await page.goBack();
    await page.goForward();
    await page.goBack();
    await page.goForward();
    await page.waitForLoadState('load');
    await expect(page.locator('body')).not.toContainText(number);

    // A's invoice address is the same "not found" as any invoice that isn't B's.
    await page.goto(`${APP_E2E_URL}${protectedRoutes.invoiceEdit(a.workspace.invoiceId)}`);
    await expect(
      page.getByRole('heading', { name: 'Invoice Not Found' })
    ).toBeVisible();
    await page.goBack();
    await page.goForward();
    await expect(page.locator('body')).not.toContainText(number);

    expect(leaks, "A's invoice number was painted for B or a Visitor").toEqual([]);
  } finally {
    await a.context.close();
  }
});
