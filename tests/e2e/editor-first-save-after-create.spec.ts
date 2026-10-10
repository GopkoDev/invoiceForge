// editor-ux T38 + T49 (review r2 N1, r3 R2/F4; test-plan AC-03 / AC-04 / AC-05 / AC-05b / AC-05c):
// when a new invoice is created, the editor's provider hands its live store to the edit page and
// moves Next's router to /invoices/<id>/edit (router.replace, scroll kept). The edit page's editor is
// new DOM, so the hand-over must keep what the Freelancer types across it: the value typed while the
// create runs, the focus and caret (keys typed after the swap land in the same field) and the total.
// After the swap the editor's DOM is the edit page's own; a later Save must not rebuild it again: an
// edit typed while that Save runs stays on screen and unsaved, and the issued-edits notice stays.
// "The swap finished" is a DOM signal, not a sleep: a property set on the quantity input's node
// before the create is gone once the edit page's editor has mounted. "No rebuild during a Save" is
// the same property set after the swap, still there when the Save has answered.
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
const saveButton = (page: Page) => page.locator('button').filter({ hasText: /^\s*Save\s*$/ });
const toastOf = (page: Page, text: string) =>
  page.locator('[data-sonner-toast]').filter({ hasText: text });
const quantity = (page: Page) => page.getByRole('textbox', { name: 'Quantity, line 1' });
const summaryTotal = (page: Page) =>
  page
    .locator('[data-slot="card"]')
    .filter({ hasText: 'Review and adjust the invoice summary details' })
    .locator('div')
    .filter({ has: page.getByText('Total', { exact: true }) })
    .filter({ hasNot: page.locator('div').filter({ has: page.getByText('Total', { exact: true }) }) });

/** Marks the quantity input's DOM node; `nodeKept` tells whether that same node is still shown. */
async function markQuantityNode(page: Page): Promise<void> {
  await quantity(page).evaluate((el) => {
    (el as unknown as { __sameNode: boolean }).__sameNode = true;
  });
}
const nodeKept = (page: Page) =>
  quantity(page).evaluate((el) => (el as unknown as { __sameNode?: boolean }).__sameNode === true);

/**
 * T59 (review r5 Q1, r4 P3): the positive signal that a Save's revalidated tree has been applied.
 * updateInvoice revalidates the edit path, so the action's answer carries a new server tree, and
 * React commits it after the toast. The edit page renders the stored version into a server-only
 * marker; once the marker shows a version past `before`, that tree has committed, and only then is
 * "the node was not rebuilt" worth reading.
 */
const serverVersion = (page: Page) =>
  page.locator('[data-editor-server-version]').getAttribute('data-editor-server-version');

async function treeCommitted(page: Page, before: string | null): Promise<void> {
  expect(before).toMatch(/^\d+$/);
  await expect.poll(() => serverVersion(page), UI).not.toBe(before);
  expect(Number(await serverVersion(page))).toBeGreaterThan(Number(before));
}

/** Waits until the edit page's editor has replaced the new-invoice editor's DOM (marked before). */
async function waitForEditPageEditor(page: Page): Promise<string> {
  await page.waitForURL(/\/invoices\/[^/]+\/edit$/, UI);
  await expect.poll(() => nodeKept(page), UI).toBe(false);
  return /\/invoices\/([^/]+)\/edit$/.exec(new URL(page.url()).pathname)![1];
}

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

/**
 * Holds the next server-action POST until `release()`, then lets it through unchanged; `answered`
 * settles once the whole answer has been handed to the page.
 */
async function holdNextAction(page: Page) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  let reached!: () => void;
  const arrived = new Promise<void>((resolve) => (reached = resolve));
  let done!: () => void;
  const answered = new Promise<void>((resolve) => (done = resolve));
  let spent = false;
  await page.route('**/*', async (route) => {
    const request = route.request();
    if (spent || request.method() !== 'POST' || !request.headers()['next-action']) {
      return route.fallback();
    }
    spent = true;
    reached();
    await gate;
    const response = await route.fetch();
    await route.fulfill({ response });
    done();
  });
  return { release, arrived, answered };
}

type Way = 'save' | 'retry';

async function createInvoice(page: Page, way: Way): Promise<string> {
  await fillNewInvoice(page);
  await markQuantityNode(page);
  if (way === 'retry') {
    await failNextSave(page);
    await saveButton(page).click();
    await expect(toastOf(page, FORCED_FAILURE_MESSAGE)).toBeVisible(UI);
    await toastOf(page, FORCED_FAILURE_MESSAGE).getByRole('button', { name: 'Retry' }).click();
  } else {
    await saveButton(page).click();
  }
  const id = await waitForEditPageEditor(page);
  await expect(toastOf(page, 'Invoice created')).toBeVisible(UI);
  return id;
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

      await notesField(page).fill('Second save notes');
      await markQuantityNode(page);
      const versionBefore = await serverVersion(page);
      const held = await holdNextAction(page);
      await saveButton(page).click();
      await held.arrived;
      await quantity(page).fill('7');
      held.release();

      await held.answered;
      await expect(toastOf(page, 'Invoice updated')).toBeVisible(UI);

      await expect(quantity(page)).toHaveValue('7');
      await expect(page.getByText('Unsaved', { exact: true })).toBeVisible();
      await treeCommitted(page, versionBefore);
      expect(await nodeKept(page)).toBe(true);
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

      await markQuantityNode(page);
      const versionBefore = await serverVersion(page);
      const held = await holdNextAction(page);
      await page.getByRole('button', { name: 'Save and issue' }).click();
      await held.arrived;
      await quantity(page).fill('7');
      held.release();

      await held.answered;
      await expect(toastOf(page, 'Invoice issued')).toBeVisible(UI);

      await expect(
        page.getByText('Your changes to the lines and other locked details were not saved because the invoice is now issued.', { exact: false })
      ).toBeVisible();
      await treeCommitted(page, versionBefore);
      expect(await nodeKept(page)).toBe(true);
    } finally {
      await f.context.close();
    }
  });
}

// T49: keys typed while the create runs and right after the swap to the edit page all land in the
// quantity field: the hand-over keeps the value, the focus and the caret, and the total follows.
test('AC-03/04/05: a quantity typed across the create and the swap to the edit page is kept whole', async ({
  browser,
}, testInfo) => {
  const f = await session(browser, testInfo, 'eux-t49-swap');
  const { page, workspace: ws } = f;
  try {
    await fillNewInvoice(page);
    await markQuantityNode(page);
    const held = await holdNextAction(page);
    await saveButton(page).click();
    await held.arrived;

    // While the create runs: the quantity becomes "1".
    await quantity(page).click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('1');
    held.release();

    const id = await waitForEditPageEditor(page);
    // After the swap, typing goes on where it was: no click, the keys follow the focus.
    await page.keyboard.type('5');

    await expect(quantity(page)).toHaveValue('15');
    await expect(quantity(page)).toBeFocused();
    await expect(page.getByText('Unsaved', { exact: true })).toBeVisible();
    // AC-04: the total follows the typed quantity: 15 x 50.00.
    await expect(summaryTotal(page)).toHaveText(/^Total\s*\$750\.00$/);

    // The next Save stores it, and a reload opens it.
    await saveButton(page).click();
    await expect(toastOf(page, 'Invoice updated')).toBeVisible(UI);
    await expect
      .poll(async () =>
        (await readInvoicesOf(ws.userId)).find((i) => i.id === id)!.items[0].quantity.toString()
      )
      .toBe('15');
    await page.reload();
    await expect(quantity(page)).toHaveValue('15');
    await expect(summaryTotal(page)).toHaveText(/^Total\s*\$750\.00$/);
  } finally {
    await f.context.close();
  }
});

// T54 (review r4 P1): Notes is named only by a useId() id, which differs on the edit page's fresh
// mount. The focus and caret still follow it: keys typed during the create and after the swap all land.
test('AC-03/05b: text typed in Notes across the create and the swap to the edit page is kept whole', async ({
  browser,
}, testInfo) => {
  const f = await session(browser, testInfo, 'eux-t54-notes');
  const { page, workspace: ws } = f;
  try {
    await fillNewInvoice(page);
    await markQuantityNode(page);
    const held = await holdNextAction(page);
    await saveButton(page).click();
    await held.arrived;

    // While the create runs: "abc" in Notes.
    await notesField(page).click();
    await page.keyboard.type('abc');
    held.release();

    const id = await waitForEditPageEditor(page);
    // After the swap, typing goes on where it was: no click, the keys follow the focus.
    await page.keyboard.type('def');

    await expect(notesField(page)).toHaveValue('abcdef');
    await expect(notesField(page)).toBeFocused();

    await saveButton(page).click();
    await expect(toastOf(page, 'Invoice updated')).toBeVisible(UI);
    await expect
      .poll(async () => (await readInvoicesOf(ws.userId)).find((i) => i.id === id)!.notes)
      .toBe('abcdef');
    await page.reload();
    await expect(notesField(page)).toHaveValue('abcdef');
  } finally {
    await f.context.close();
  }
});

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
    await held.answered;
    await expect(toastOf(page, 'Invoice updated')).toBeVisible(UI);
    await expect(quantity(page)).toHaveValue('7');
    await expect(page.getByText('Unsaved', { exact: true })).toBeVisible();
  } finally {
    await f.context.close();
  }
});
