// AC-07 (test-plan.md e2e row, sad.md §10): A had an invoice open, signed out, B signed in in the
// same tab. Moving Back/Forward, no frame ever shows A's invoice number; A's invoice address
// shows B "Invoice Not Found"; a direct GET of it after sign-out carries no invoice data; Back/Forward
// between two invoices of one Freelancer (reached through the app's client router) shows the right one each
// time, with its own Customer, line and total. T43 (review r2 T-k) added: Y is a different invoice, the
// X->Y move is a client-side navigation, the Visitor's Back is proven to reach A's address, and
// `pageshow.persisted` is recorded as an annotation. Runs in the chromium and webkit projects (playwright.config.ts).
import { test, expect, type BrowserContext, type Page, type TestInfo } from '@playwright/test';
import { openSignedInFreelancer } from './support/signed-in';
import { signInWithSignInLink } from './support/genuine-session';
import { seedWorkspace, readStoredInvoice, readInvoicesOf, type SeededWorkspace } from './support/seed';
import { createTestPrismaClient } from '../support/db/client';
import { openEditor, chooseRowAction, notesField } from './support/invoice-ui';
import { createCustomer } from '../support/factories/customer';
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

interface InvoiceFacts {
  id: string;
  number: string;
  customer: string;
  line: string;
  /** The total as the editor writes it (no currency symbol). */
  total: string;
}

const FACTS_X = { customer: 'Xylophone Customer Ltd', line: 'Test Item', total: '100.00' };

/**
 * A second invoice of the same Freelancer that shares nothing visible with the seeded one: its own
 * number, Customer, line name and total (3 x 250.00 = 750.00).
 */
async function seedInvoiceY(x: SeededWorkspace): Promise<InvoiceFacts> {
  const { id, createdAt, updatedAt, ...stored } = await readStoredInvoice(x.invoiceId);
  void [id, createdAt, updatedAt]; // the copy gets its own
  const number = stored.invoiceNumber.replace(/-0001$/, '-0002');
  const customer = 'Yak Customer Ltd';
  const line = 'Yodelling Lessons';
  const prisma = createTestPrismaClient(readE2eRuntime().databaseUrl);
  try {
    const yCustomer = await createCustomer(prisma, x.userId, { name: customer, address: '9 Yak Road' });
    const created = await prisma.invoice.create({
      data: {
        ...stored,
        invoiceNumber: number,
        invoiceNumberKey: number.toLowerCase(),
        customerId: yCustomer.id,
        customerName: customer,
        customerAddress: yCustomer.address,
        subtotal: 750,
        total: 750,
        items: { create: [{ name: line, unit: 'pcs', quantity: 3, rate: 250, amount: 750 }] },
      },
    });
    return { id: created.id, number, customer, line, total: '750.00' };
  } finally {
    await prisma.$disconnect();
  }
}

const fieldValues = (page: Page): Promise<string[]> =>
  page.locator('input, textarea').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));

/** Every fact of `own` is on screen (editor and preview text), none of `other`'s is. */
async function expectOnlyInvoice(page: Page, own: InvoiceFacts, other: InvoiceFacts): Promise<void> {
  const body = page.locator('body');
  for (const fact of [own.number, own.customer, own.line, own.total]) {
    await expect(body, `${own.number}: ${fact}`).toContainText(fact);
  }
  for (const fact of [other.number, other.customer, other.line, other.total]) {
    await expect(body, `${own.number} must not show ${fact}`).not.toContainText(fact);
  }
}

/** Every `pageshow` of the tab, by path, with whether it was a back/forward cache restore. */
async function watchPageshow(context: BrowserContext): Promise<Array<{ path: string; persisted: boolean }>> {
  const shows: Array<{ path: string; persisted: boolean }> = [];
  await context.exposeFunction('__reportPageshow', (path: string, persisted: boolean) => {
    shows.push({ path, persisted });
  });
  await context.addInitScript(() => {
    if (window !== window.top) return;
    addEventListener('pageshow', (e) =>
      (window as unknown as { __reportPageshow: (p: string, b: boolean) => void }).__reportPageshow(
        location.pathname,
        e.persisted
      )
    );
  });
  return shows;
}

function annotatePageshow(
  testInfo: TestInfo,
  browserName: string,
  shows: Array<{ path: string; persisted: boolean }>
): void {
  testInfo.annotations.push({
    type: `pageshow.persisted (${browserName})`,
    description: `restored from cache: ${shows.some((s) => s.persisted)}; ${JSON.stringify(shows)}`,
  });
}

/** Main-frame document requests of the tab (a redirect's first hop included), as full URLs. */
function recordNavigationRequests(page: Page): string[] {
  const urls: string[] = [];
  page.on('request', (r) => {
    if (r.isNavigationRequest() && r.frame() === page.mainFrame()) urls.push(r.url());
  });
  return urls;
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
  browserName,
}, testInfo) => {
  test.setTimeout(300_000);
  const a = await openSignedInFreelancer(browser, testInfo, 'se-a', {
    seed: { customerName: CUSTOMER_A },
  });
  try {
    const { page, context } = a;
    const number = a.workspace.invoiceNumber;

    const leaks = await watchForLeaks(context, [number, CUSTOMER_A]);
    const shows = await watchPageshow(context);
    const navigations = recordNavigationRequests(page);

    await openEditor(page, a.workspace.invoiceId);
    await expect(page.locator('body')).toContainText(number);
    const editorUrlA = page.url();
    const afterOwn = leaks.length; // A seeing A's own invoice is expected

    await signOut(page);

    // A Visitor pressing Back/Forward sees none of A's data and is sent to sign in.
    await page.goto(`${APP_E2E_URL}/login`);
    await page.waitForURL(/\/login/);
    await settleFrames(page);
    // Frames reported by A's own page before this point are expected; from here none may be.
    const afterSignOut = Math.max(afterOwn, leaks.length);
    const navigationsBefore = navigations.length;
    const showsBefore = shows.length;
    await step(page, 'back');
    await page.waitForURL(/\/login/);
    await expect(page.locator('body')).not.toContainText(number);
    // The Visitor's Back really did reach A's editor address (the server then sent them to sign-in),
    // or the browser restored that very page from its cache: either way the page was A's editor.
    const pathA = new URL(editorUrlA).pathname;
    expect(
      navigations.slice(navigationsBefore).some((u) => new URL(u).pathname === pathA) ||
        shows.slice(showsBefore).some((s) => s.path === pathA && s.persisted),
      "the Visitor's Back never reached A's editor address"
    ).toBe(true);
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
    annotatePageshow(testInfo, browserName, shows);
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
  browserName,
}, testInfo) => {
  test.setTimeout(300_000);
  const a = await openSignedInFreelancer(browser, testInfo, 'se-two', {
    seed: { customerName: FACTS_X.customer },
  });
  try {
    const { page } = a;
    const shows = await watchPageshow(a.context);
    const x: InvoiceFacts = { id: a.workspace.invoiceId, number: a.workspace.invoiceNumber, ...FACTS_X };
    const y = await seedInvoiceY(a.workspace);
    const urlOf = (id: string) => `${APP_E2E_URL}${protectedRoutes.invoiceEdit(id)}`;
    const listUrl = `${APP_E2E_URL}${protectedRoutes.invoices}`;
    const loads = recordNavigationRequests(page);

    await openEditor(page, x.id);
    await expectOnlyInvoice(page, x, y);

    // X -> Y through the app, never by typing an address: Home (client router) to the list, then the
    // row's Edit action (router.push). The document is not reloaded on the way.
    await page.evaluate(() => ((window as unknown as { __sameDocument: boolean }).__sameDocument = true));
    const loadsBefore = loads.length;
    await page.getByRole('button', { name: 'Home' }).click();
    await page.waitForURL(listUrl);
    await chooseRowAction(page, y.number, 'Edit');
    await page.waitForURL(urlOf(y.id));
    await expectOnlyInvoice(page, y, x);
    expect(
      await page.evaluate(() => (window as unknown as { __sameDocument?: boolean }).__sameDocument),
      'X -> Y was a full page load, not the client router'
    ).toBe(true);
    expect(loads.slice(loadsBefore), 'X -> Y requested a document').toEqual([]);

    for (let round = 0; round < 2; round++) {
      await step(page, 'back');
      await page.waitForURL(listUrl);
      await expect(page.locator('body')).toContainText(y.number);
      await expect(page.locator('body')).toContainText(x.number);
      await step(page, 'back');
      await page.waitForURL(urlOf(x.id));
      await expectOnlyInvoice(page, x, y);
      await step(page, 'forward');
      await page.waitForURL(listUrl);
      await step(page, 'forward');
      await page.waitForURL(urlOf(y.id));
      await expectOnlyInvoice(page, y, x);
    }
    annotatePageshow(testInfo, browserName, shows);
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

test('AC-07 (T38 handoff): B never sees the invoice A created, opening a new invoice in the same tab', async ({
  browser,
  browserName,
}, testInfo) => {
  test.setTimeout(300_000);
  const LINE_A = 'Handoff Probe Line Alpha';
  const NOTES_A = 'Handoff probe notes of A';
  const a = await openSignedInFreelancer(browser, testInfo, 'se-handoff', {
    seed: { customerName: CUSTOMER_A, timeZone: 'UTC' },
    context: { viewport: { width: 1280, height: 800 } },
  });
  try {
    const { page, context } = a;
    const leaks = await watchForLeaks(context, [LINE_A, CUSTOMER_A, NOTES_A]);
    const shows = await watchPageshow(context);

    // A creates an invoice: /invoices/new becomes /invoices/<id>/edit (the store handoff).
    await page.goto(`${APP_E2E_URL}${protectedRoutes.invoicesNew}`);
    await expect(page.getByRole('textbox', { name: /^Invoice Number/ })).toBeVisible();
    const pick = async (trigger: string, option: string) => {
      await page.getByRole('button', { name: trigger }).click();
      await page.getByRole('option', { name: option }).first().click();
    };
    if (await page.getByRole('button', { name: 'Select sender profile...' }).count()) {
      await pick('Select sender profile...', 'Test Sender Profile');
    }
    await expect(page.getByRole('button', { name: /Test Bank/ })).toBeVisible();
    await pick('Select customer...', CUSTOMER_A);
    await page.getByRole('button', { name: 'Custom Item' }).click();
    await page.getByPlaceholder('Enter product name...').fill(LINE_A);
    await page.getByRole('textbox', { name: 'Price, line 1' }).fill('50');
    await page.locator('button').filter({ hasText: /^\s*Save\s*$/ }).click();
    await page.waitForURL(/\/invoices\/[^/]+\/edit$/, { timeout: 30_000 });
    const createdPath = new URL(page.url()).pathname;
    await expect(page.getByPlaceholder('Enter product name...')).toHaveValue(LINE_A);
    // Typed after the handoff, so A's live store holds something the server does not.
    await notesField(page).fill(NOTES_A);
    const created = (await readInvoicesOf(a.workspace.userId)).find((i) => i.items[0]?.name === LINE_A);
    expect(created, "A's invoice was created").toBeTruthy();

    // Leave A's editor first, as the Log out button does: a request still in flight from it (the
    // create's refresh) could re-issue A's session cookie after the sign-out (see signOut).
    await page.waitForLoadState('networkidle');
    await page.goto('about:blank');
    await signOut(page);
    await page.goto(`${APP_E2E_URL}/login`);
    await page.waitForURL(/\/login/);
    await settleFrames(page);
    const afterSignOut = leaks.length;

    // B signs in, same tab, and starts a new invoice.
    const emailB = uniqueTestEmail('se-handoff-b');
    await seedWorkspace(emailB);
    await signInWithSignInLink(page, emailB);
    await page.goto(`${APP_E2E_URL}${protectedRoutes.invoicesNew}`);
    await expect(page.getByRole('textbox', { name: /^Invoice Number/ })).toBeVisible();
    // No wait for B's number-hint request: one cut off by leaving the page no longer sends the tab
    // to the clear-session route (T45b), so the spec goes straight on and proves that.
    await settleFrames(page);
    const body = page.locator('body');
    for (const secret of [LINE_A, CUSTOMER_A, NOTES_A, created!.invoiceNumber]) {
      await expect(body).not.toContainText(secret);
    }
    const values = await fieldValues(page);
    expect(values, "B's new invoice holds a value of A's").not.toContain(LINE_A);
    expect(values).not.toContain(NOTES_A);
    expect(await page.getByPlaceholder('Enter product name...').count()).toBe(0);

    // A's invoice address is "not found" for B, and the new-invoice page B just left shows nothing of A's.
    await page.goto(`${APP_E2E_URL}${createdPath}`);
    await expect(page.getByRole('heading', { name: 'Invoice Not Found' })).toBeVisible();
    await expect(body).not.toContainText(LINE_A);
    await settleFrames(page);
    expect(leaks.slice(afterSignOut), "A's draft was painted for B").toEqual([]);
    annotatePageshow(testInfo, browserName, shows);
  } finally {
    await a.context.close();
  }
});
