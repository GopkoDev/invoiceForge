// AC-07 (test-plan.md e2e row, sad.md §10): A had an invoice open, signed out, B signed in in the
// same tab. Moving Back/Forward, no frame ever shows A's invoice number; A's invoice address
// shows B "Invoice Not Found"; a direct GET of it after sign-out carries no invoice data; Back/Forward
// between two invoices of one Freelancer shows the right one each time. Runs in the chromium and webkit projects (playwright.config.ts).
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { openSignedInFreelancer } from './support/signed-in';
import { signInWithSignInLink } from './support/genuine-session';
import { seedWorkspace, readStoredInvoice } from './support/seed';
import { createTestPrismaClient } from '../support/db/client';
import { openEditor } from './support/invoice-ui';
import { APP_E2E_URL, readE2eRuntime } from './support/app-server';
import { uniqueTestEmail } from '../support/factories/ids';
import { protectedRoutes } from '../../config/routes.config';

const CUSTOMER_A = 'Aardvark Leak Probe Ltd';

test.describe.configure({ timeout: 300_000 });

const hasSessionCookie = async (page: Page): Promise<boolean> =>
  (await page.context().cookies()).some((c) => /session-token/.test(c.name));

/**
 * Ends the session the way the app's Log out does: Auth.js CSRF-protected POST to
 * /api/auth/signout. A request still in flight from the open page can re-issue the cookie it
 * carried, so the POST is repeated until the session cookie stays gone.
 */
async function signOut(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { csrfToken } = await (
      await page.context().request.get(`${APP_E2E_URL}/api/auth/csrf`)
    ).json();
    await page.context().request.post(`${APP_E2E_URL}/api/auth/signout`, {
      form: { csrfToken },
    });
    await settleFrames(page).catch(() => undefined);
    if (!(await hasSessionCookie(page))) return;
  }
  throw new Error('the session cookie is still set after repeated sign-out');
}

/** A second invoice of the same Freelancer (a copy of the seeded one under a new number). */
async function seedSecondInvoice(invoiceId: string): Promise<{ id: string; number: string }> {
  const { id, createdAt, updatedAt, ...stored } = await readStoredInvoice(invoiceId);
  void [id, createdAt, updatedAt]; // the copy gets its own
  const number = stored.invoiceNumber.replace(/-0001$/, '-0002');
  const prisma = createTestPrismaClient(readE2eRuntime().databaseUrl);
  try {
    const created = await prisma.invoice.create({
      data: { ...stored, invoiceNumber: number, invoiceNumberKey: number.toLowerCase() },
    });
    return { id: created.id, number };
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Checks every painted frame in the page itself (the init script also runs in documents restored
 * from the back/forward cache) and reports the path of each frame that shows one of `needles`. A
 * frame counts only while the document is not hidden by the restore guard.
 */
async function watchForLeaks(context: BrowserContext, needles: string[]): Promise<string[]> {
  const leaks: string[] = [];
  await context.exposeFunction('__reportLeak', (where: string) => {
    leaks.push(where);
  });
  await context.addInitScript((needles: string[]) => {
    const tick = () => {
      const hidden =
        document.documentElement.style.visibility === 'hidden' ||
        document.visibilityState === 'hidden';
      if (!hidden && document.body && needles.some((n) => document.body.innerText.includes(n))) {
        (window as unknown as { __reportLeak: (w: string) => void }).__reportLeak(
          location.pathname
        );
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, needles);
  return leaks;
}

/** Lets a painted frame of the current document be checked (and its report delivered). */
async function settleFrames(page: Page): Promise<void> {
  await page.evaluate(
    () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
  );
}

/**
 * Waits until the tab stops navigating: a signed-in visitor sent Back to an auth page is redirected
 * on by the app, so one Back can set off a short chain of loads. At rest = loaded, and no further
 * main-frame navigation starts within a quiet window.
 */
async function settle(page: Page): Promise<void> {
  for (let hops = 0; hops < 10; hops++) {
    await page.waitForLoadState('load').catch(() => undefined); // replaced mid-wait: go round
    const movedOn = await page
      .waitForEvent('framenavigated', {
        predicate: (frame) => frame === page.mainFrame(),
        timeout: 1_500,
      })
      .then(
        () => true,
        () => false
      );
    if (!movedOn) return;
  }
  throw new Error(`the tab never came to rest (at ${page.url()})`);
}

/**
 * One Back or Forward press, then wait for the tab to come to rest. Resolves on commit, not on
 * load: a restored (bfcache) or redirected entry may never fire a new load event, and a press
 * that waits for one hangs.
 */
async function step(page: Page, direction: 'back' | 'forward'): Promise<void> {
  const press = direction === 'back' ? page.goBack.bind(page) : page.goForward.bind(page);
  try {
    await press({ waitUntil: 'commit', timeout: 15_000 });
  } catch {
    // No entry to move to, or the entry moved on by itself: the settle below tells where we are.
  }
  await settle(page);
}

test('AC-07: B never sees A\'s invoice through sign-out, sign-in, Back and Forward', async ({
  browser,
}, testInfo) => {
  test.setTimeout(300_000);
  const a = await openSignedInFreelancer(browser, testInfo, 'se-a', {
    seed: { customerName: CUSTOMER_A },
  });
  try {
    const { page, context } = a;
    const number = a.workspace.invoiceNumber;

    const leaks = await watchForLeaks(context, [number, CUSTOMER_A]);

    await openEditor(page, a.workspace.invoiceId);
    await expect(page.locator('body')).toContainText(number);
    const afterOwn = leaks.length; // A seeing A's own invoice is expected

    await signOut(page);

    // A Visitor pressing Back/Forward sees none of A's data and is sent to sign in.
    await page.goto(`${APP_E2E_URL}/login`);
    await page.waitForURL(/\/login/);
    await settleFrames(page);
    // Frames reported by A's own page before this point are expected; from here none may be.
    const afterSignOut = Math.max(afterOwn, leaks.length);
    await step(page, 'back');
    await page.waitForURL(/\/login/);
    await expect(page.locator('body')).not.toContainText(number);
    await step(page, 'forward');
    await step(page, 'back');
    await page.waitForURL(/\/login/);
    expect(leaks.slice(afterSignOut), 'A\'s data showed to a Visitor').toEqual([]);

    // B signs in, same tab.
    const emailB = uniqueTestEmail('se-b');
    await seedWorkspace(emailB);
    await signInWithSignInLink(page, emailB);
    await settleFrames(page);
    const afterSignIn = leaks.length;

    await step(page, 'back');
    await step(page, 'forward');
    await step(page, 'back');
    await step(page, 'forward');
    await expect(page.locator('body')).not.toContainText(number);
    expect(leaks.slice(afterSignIn), "A's data was painted for B").toEqual([]);

    // A's invoice address is the same "not found" as any invoice that isn't B's.
    await page.goto(`${APP_E2E_URL}${protectedRoutes.invoiceEdit(a.workspace.invoiceId)}`);
    await expect(
      page.getByRole('heading', { name: 'Invoice Not Found' })
    ).toBeVisible();
    await step(page, 'back');
    await step(page, 'forward');
    await expect(page.locator('body')).not.toContainText(number);

    expect(leaks.slice(afterSignOut), "A's invoice was painted for B or a Visitor").toEqual([]);
  } finally {
    await a.context.close();
  }
});

test('AC-07: after sign-out a direct request for A\'s editor address carries no invoice data', async ({
  browser,
}, testInfo) => {
  test.setTimeout(300_000);
  const a = await openSignedInFreelancer(browser, testInfo, 'se-direct', {
    seed: { customerName: CUSTOMER_A },
  });
  try {
    const { page } = a;
    const number = a.workspace.invoiceNumber;
    const url = `${APP_E2E_URL}${protectedRoutes.invoiceEdit(a.workspace.invoiceId)}`;
    await openEditor(page, a.workspace.invoiceId);
    await expect(page.locator('body')).toContainText(number);

    // Leave the editor first, as the Log out button does: a request still in flight from it could
    // re-issue the session cookie after the sign-out.
    await page.goto('about:blank');
    await signOut(page);
    expect(await hasSessionCookie(page), 'the session cookie is gone after sign-out').toBe(false);

    const response = await page.request.get(url);
    const body = await response.text();
    expect(body).not.toContain(number);
    expect(body).not.toContain(CUSTOMER_A);

    await page.goto(url);
    await page.waitForURL(/\/login/);
    await expect(page.locator('body')).not.toContainText(number);
    await expect(page.locator('body')).not.toContainText(CUSTOMER_A);
    expect(await page.content()).not.toContain(number);
  } finally {
    await a.context.close();
  }
});

test('AC-07: Back and Forward between two invoices of one Freelancer show the right one each time', async ({
  browser,
}, testInfo) => {
  test.setTimeout(300_000);
  const a = await openSignedInFreelancer(browser, testInfo, 'se-two');
  try {
    const { page } = a;
    const x = { id: a.workspace.invoiceId, number: a.workspace.invoiceNumber };
    const y = await seedSecondInvoice(x.id);
    const urlOf = (id: string) => `${APP_E2E_URL}${protectedRoutes.invoiceEdit(id)}`;
    const shows = async (own: { number: string }, other: { number: string }) => {
      await expect(page.locator('body')).toContainText(own.number);
      await expect(page.locator('body')).not.toContainText(other.number);
    };

    await openEditor(page, x.id);
    await shows(x, y);
    await page.goto(urlOf(y.id));
    await page.waitForURL(urlOf(y.id));
    await shows(y, x);

    for (let round = 0; round < 2; round++) {
      await step(page, 'back');
      await page.waitForURL(urlOf(x.id));
      await shows(x, y);
      await step(page, 'forward');
      await page.waitForURL(urlOf(y.id));
      await shows(y, x);
    }
  } finally {
    await a.context.close();
  }
});

test('AC-07: B pressing Back to A\'s editor address never sees A\'s invoice', async ({
  browser,
}, testInfo) => {
  test.setTimeout(300_000);
  const a = await openSignedInFreelancer(browser, testInfo, 'se-back', {
    seed: { customerName: CUSTOMER_A },
  });
  try {
    const { page, context } = a;
    const number = a.workspace.invoiceNumber;
    const leaks = await watchForLeaks(context, [number, CUSTOMER_A]);

    await openEditor(page, a.workspace.invoiceId);
    await expect(page.locator('body')).toContainText(number);
    const editorUrlA = page.url();
    const afterOwn = leaks.length;

    await signOut(page);
    await page.goto(`${APP_E2E_URL}/login`);
    await page.waitForURL(/\/login/);
    await settleFrames(page);
    const afterSignOut = Math.max(afterOwn, leaks.length);

    const emailB = uniqueTestEmail('se-b');
    await seedWorkspace(emailB);
    await signInWithSignInLink(page, emailB);

    // B presses Back until A's editor address comes up again; it never shows A's invoice.
    let reached = page.url() === editorUrlA;
    for (let i = 0; i < 10 && !reached && page.url() !== 'about:blank'; i++) {
      await step(page, 'back');
      reached = page.url() === editorUrlA;
    }
    expect(reached, "Back never reached A's editor address").toBe(true);
    await expect(page.getByRole('heading', { name: 'Invoice Not Found' })).toBeVisible();
    await expect(page.locator('body')).not.toContainText(number);
    await expect(page.locator('body')).not.toContainText(CUSTOMER_A);
    await settleFrames(page);
    // And Forward again, back to where B came from.
    await step(page, 'forward');
    await page.waitForLoadState('load');
    await expect(page.locator('body')).not.toContainText(number);
    expect(leaks.slice(afterSignOut), "A's data was painted for B").toEqual([]);
  } finally {
    await a.context.close();
  }
});
