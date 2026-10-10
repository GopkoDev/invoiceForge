// editor-ux T38 (review r2 N1; test-plan AC-03 / AC-04 / AC-05b / AC-05c): after a new invoice is
// created, the address changes to /invoices/<id>/edit by history.replaceState while the router
// still shows the `new` page. The next Save must not make the router remount the editor: an edit
// typed while that Save runs stays on screen and unsaved, and the issued-edits notice stays.
// A remount is detected two ways: the typed value is gone, and a property set on the quantity
// input's DOM node (which only a client-side survival of the same node keeps) is gone.
import { test, expect, type Browser, type Page, type TestInfo } from '@playwright/test';
import { openSignedInFreelancer } from './support/signed-in';
import { notesField } from './support/invoice-ui';
import { APP_E2E_URL } from './support/app-server';
import { FORCED_FAILURE_MESSAGE, failNextSave } from './support/save-failure';
import { readInvoicesOf } from './support/seed';
import { protectedRoutes } from '../../config/routes.config';

test.describe.configure({ timeout: 120_000 });
test.use({ actionTimeout: 15_000 });

const UI = { timeout: 15_000 };
const SETTLE_MS = 2_000;
const saveButton = (page: Page) => page.locator('button').filter({ hasText: /^\s*Save\s*$/ });
const toastOf = (page: Page, text: string) =>
  page.locator('[data-sonner-toast]').filter({ hasText: text });
const quantity = (page: Page) => page.getByRole('textbox', { name: 'Quantity, line 1' });

async function fillNewInvoice(page: Page): Promise<void> {
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
  await pick('Select customer...', 'Test Customer');
  await page.getByRole('button', { name: 'Custom Item' }).click();
  await page.getByPlaceholder('Enter product name...').fill('First save after create');
  await page.getByRole('textbox', { name: 'Price, line 1' }).fill('50');
  await quantity(page).fill('2');
}

/** Holds the next server-action POST until `release()`, then lets it through unchanged. */
async function holdNextAction(page: Page) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  let reached!: () => void;
  const arrived = new Promise<void>((resolve) => (reached = resolve));
  let spent = false;
  await page.route('**/*', async (route) => {
    const request = route.request();
    if (spent || request.method() !== 'POST' || !request.headers()['next-action']) {
      return route.fallback();
    }
    spent = true;
    reached();
    await gate;
    await route.continue();
  });
  return { release, arrived };
}

type Way = 'save' | 'retry';

async function createInvoice(page: Page, way: Way): Promise<string> {
  await fillNewInvoice(page);
  if (way === 'retry') {
    await failNextSave(page);
    await saveButton(page).click();
    await expect(toastOf(page, FORCED_FAILURE_MESSAGE)).toBeVisible(UI);
    await toastOf(page, FORCED_FAILURE_MESSAGE).getByRole('button', { name: 'Retry' }).click();
  } else {
    await saveButton(page).click();
  }
  await page.waitForURL(/\/invoices\/[^/]+\/edit$/, UI);
  await expect(toastOf(page, 'Invoice created')).toBeVisible(UI);
  return /\/invoices\/([^/]+)\/edit$/.exec(new URL(page.url()).pathname)![1];
}

async function session(browser: Browser, testInfo: TestInfo, name: string) {
  return openSignedInFreelancer(browser, testInfo, name, {
    seed: { timeZone: 'UTC', status: 'DRAFT' },
    context: { viewport: { width: 1280, height: 800 } },
  });
}

for (const way of ['save', 'retry'] as const) {
  test(`AC-03/04/05c: first Save after a ${way === 'save' ? '' : 'Retry '}create keeps a quantity typed during it`, async ({
    browser,
  }, testInfo) => {
    const f = await session(browser, testInfo, `eux-t38-upd-${way}`);
    const { page, workspace: ws } = f;
    try {
      const id = await createInvoice(page, way);
      // Let the create's own refresh and toast settle so they cannot hide the effect under test.
      await page.waitForTimeout(SETTLE_MS);

      await notesField(page).fill('Second save notes');
      await quantity(page).evaluate((el) => {
        (el as unknown as { __sameNode: boolean }).__sameNode = true;
      });
      const held = await holdNextAction(page);
      await saveButton(page).click();
      await held.arrived;
      await quantity(page).fill('7');
      held.release();

      await expect(toastOf(page, 'Invoice updated')).toBeVisible(UI);
      await page.waitForTimeout(SETTLE_MS);

      await expect(quantity(page)).toHaveValue('7');
      await expect(page.getByText('Unsaved', { exact: true })).toBeVisible();
      expect(
        await quantity(page).evaluate((el) => (el as unknown as { __sameNode?: boolean }).__sameNode)
      ).toBe(true);
      expect(new URL(page.url()).pathname).toBe(protectedRoutes.invoiceEdit(id));

      // The stored invoice holds what was sent, not the edit made during the save.
      const stored = (await readInvoicesOf(ws.userId)).find((i) => i.id === id)!;
      expect(stored.notes).toBe('Second save notes');
      expect(stored.items[0].quantity.toString()).toBe('2');

      // The next Save stores the kept edit.
      await saveButton(page).click();
      await expect(toastOf(page, 'Invoice updated').last()).toBeVisible(UI);
      await expect
        .poll(async () =>
          (await readInvoicesOf(ws.userId)).find((i) => i.id === id)!.items[0].quantity.toString()
        )
        .toBe('7');
    } finally {
      await f.context.close();
    }
  });

  test(`AC-05b: first Save and issue after a ${way === 'save' ? '' : 'Retry '}create keeps the dropped-edits notice`, async ({
    browser,
  }, testInfo) => {
    const f = await session(browser, testInfo, `eux-t38-iss-${way}`);
    const { page } = f;
    try {
      await createInvoice(page, way);
      await page.waitForTimeout(SETTLE_MS);

      await quantity(page).evaluate((el) => {
        (el as unknown as { __sameNode: boolean }).__sameNode = true;
      });
      const held = await holdNextAction(page);
      await page.getByRole('button', { name: 'Save and issue' }).click();
      await held.arrived;
      await quantity(page).fill('7');
      held.release();

      await expect(toastOf(page, 'Invoice issued')).toBeVisible(UI);
      await page.waitForTimeout(SETTLE_MS);

      await expect(
        page.getByText('Your latest changes were not saved because the invoice is now issued.')
      ).toBeVisible();
    } finally {
      await f.context.close();
    }
  });
}

// Control: the same typing during a Save on an invoice opened by its address (never created in
// this page) keeps the edit, so a failure above is the create-then-Save path, not the harness.
test('control: a quantity typed during a Save of an opened invoice stays', async ({
  browser,
}, testInfo) => {
  const f = await session(browser, testInfo, 'eux-t38-control');
  const { page, workspace: ws } = f;
  try {
    await page.goto(`${APP_E2E_URL}${protectedRoutes.invoiceEdit(ws.invoiceId)}`);
    await expect(quantity(page)).toBeVisible();
    await notesField(page).fill('Control notes');
    const held = await holdNextAction(page);
    await saveButton(page).click();
    await held.arrived;
    await quantity(page).fill('7');
    held.release();
    await expect(toastOf(page, 'Invoice updated')).toBeVisible(UI);
    await page.waitForTimeout(SETTLE_MS);
    await expect(quantity(page)).toHaveValue('7');
    await expect(page.getByText('Unsaved', { exact: true })).toBeVisible();
  } finally {
    await f.context.close();
  }
});
