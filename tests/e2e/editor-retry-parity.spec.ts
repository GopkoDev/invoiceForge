// editor-ux T20 (test-plan.md AC-05c / AC-05d e2e rows; NFR «Retry parity»; ADR-0005): every save
// outcome - created, updated, issued, changed elsewhere, totals changed, field error - is reached
// once by Save and once by Retry (after a forced failure), and both ends show the same address,
// dialog, unsaved flag, field errors and messages.
//
// Not covered here, by design: «Retry while a save is running» and «Retry after the editor moved
// to another invoice» do nothing. Both need a click that races the save or a second editor
// session, which an e2e cannot time reliably; they are proven on the save command in
// tests/unit/store/save-command-race.test.ts and tests/unit/store/retry-through-save-command.test.ts.
import { test, expect, type Browser, type Page, type TestInfo } from '@playwright/test';
import { openSignedInFreelancer } from './support/signed-in';
import { notesField, openEditor } from './support/invoice-ui';
import { APP_E2E_URL } from './support/app-server';
import { FORCED_FAILURE_MESSAGE, failNextSave } from './support/save-failure';
import {
  changeInvoiceElsewhere,
  readInvoicesOf,
  type SeededWorkspace,
} from './support/seed';
import { protectedRoutes } from '../../config/routes.config';

test.describe.configure({ timeout: 90_000 });
test.use({ actionTimeout: 15_000 });
// The outcome dialogs follow a server round trip and load their component on demand (T5); under a
// full parallel run that takes longer than the 5 s default.
const DIALOG_TIMEOUT = { timeout: 15_000 };

type Path = 'save' | 'retry';
type Intent = 'save' | 'save-and-issue';

interface Scenario {
  label: string;
  seed?: 'DRAFT';
  intent: Intent;
  /** Opens the editor on the precondition's page. */
  open: (page: Page, ws: SeededWorkspace) => Promise<void>;
  /** The edit that makes the form unsaved before the first save. */
  edit: (page: Page, ws: SeededWorkspace) => Promise<void>;
  /** An edit made after the failure on the Retry path (before Save on the Save path). */
  late?: (page: Page) => Promise<void>;
  /** Changes the world behind the editor's back, right before the save. */
  elsewhere?: (ws: SeededWorkspace) => Promise<void>;
  /** The outcome is on screen. */
  settled: (page: Page) => Promise<void>;
}

const LATE_NOTE = 'Typed after the failure';
const dialogOf = (page: Page) => page.getByRole('dialog');
// Found by its text, not its role: an open dialog hides the page behind it from the role tree.
const saveButton = (page: Page) => page.locator('button').filter({ hasText: /^\s*Save\s*$/ });
const toastOf = (page: Page, text: string) =>
  page.locator('[data-sonner-toast]').filter({ hasText: text });

const openExisting = (page: Page, ws: SeededWorkspace) => openEditor(page, ws.invoiceId);
const editNotes = async (page: Page) => {
  await notesField(page).fill('Edited before saving');
};

async function fillNewInvoice(page: Page): Promise<void> {
  await page.goto(`${APP_E2E_URL}${protectedRoutes.invoicesNew}`);
  await expect(page.getByRole('textbox', { name: /^Invoice Number/ })).toBeVisible();
  const pick = async (trigger: string, option: string) => {
    await page.getByRole('button', { name: trigger }).click();
    await page.getByRole('option', { name: option }).first().click();
  };
  await pick('Select sender profile...', 'Test Sender Profile');
  // The sender profile's only bank account is selected with it.
  await expect(page.getByRole('button', { name: /Test Bank/ })).toBeVisible();
  await pick('Select customer...', 'Test Customer');
  await page.getByRole('button', { name: 'Custom Item' }).click();
  await page.getByPlaceholder('Enter product name...').fill('Retry parity work');
  await page.getByRole('textbox', { name: 'Price, line 1' }).fill('50');
  await page.getByRole('textbox', { name: 'Quantity, line 1' }).fill('2');
}

const scenarios: Record<string, Scenario> = {
  created: {
    label: 'created',
    intent: 'save',
    open: async (page) => fillNewInvoice(page),
    edit: async () => {},
    late: async (page) => {
      await notesField(page).fill(LATE_NOTE);
    },
    settled: async (page) => {
      await page.waitForURL(/\/invoices\/[^/]+\/edit$/);
      await expect(toastOf(page, 'Invoice created')).toBeVisible();
    },
  },
  updated: {
    label: 'updated',
    seed: 'DRAFT',
    intent: 'save',
    open: openExisting,
    edit: editNotes,
    late: async (page) => {
      await page.getByRole('textbox', { name: 'Quantity, line 1' }).fill('3');
    },
    settled: async (page) => {
      await expect(toastOf(page, 'Invoice updated')).toBeVisible();
    },
  },
  issued: {
    label: 'issued',
    seed: 'DRAFT',
    intent: 'save-and-issue',
    open: openExisting,
    edit: editNotes,
    settled: async (page) => {
      await expect(toastOf(page, 'Invoice issued')).toBeVisible();
    },
  },
  'changed elsewhere': {
    label: 'changed elsewhere',
    seed: 'DRAFT',
    intent: 'save',
    open: openExisting,
    edit: editNotes,
    elsewhere: (ws) => changeInvoiceElsewhere(ws.invoiceId, { bumpVersion: true }),
    settled: async (page) => {
      await expect(dialogOf(page)).toContainText('This invoice changed elsewhere', DIALOG_TIMEOUT);
    },
  },
  'totals changed': {
    label: 'totals changed',
    seed: 'DRAFT',
    intent: 'save',
    open: openExisting,
    edit: editNotes,
    // The stored total disagrees with the stored lines (100): the server asks to confirm.
    elsewhere: (ws) => changeInvoiceElsewhere(ws.invoiceId, { storedTotal: 90 }),
    settled: async (page) => {
      await expect(dialogOf(page)).toContainText('Confirm the new total', DIALOG_TIMEOUT);
    },
  },
  'field error': {
    label: 'field error',
    seed: 'DRAFT',
    intent: 'save',
    open: openExisting,
    edit: async (page) => {
      await page.getByRole('textbox', { name: 'Quantity, line 1' }).fill('0');
    },
    settled: async (page) => {
      await expect(page.getByText('Quantity must be greater than zero.')).toBeVisible();
    },
  },
};

interface Observation {
  address: string;
  dialog: string;
  unsavedFlag: 'Unsaved' | 'Saved' | 'none';
  saveEnabled: boolean;
  fieldError: boolean;
  messages: string[];
}

async function observe(page: Page, ws: SeededWorkspace): Promise<Observation> {
  const unsaved = await page.getByText('Unsaved', { exact: true }).isVisible();
  const saved = await page.getByText('Saved', { exact: true }).isVisible();
  const messages = (await page.locator('[data-sonner-toast]').allInnerTexts()).map((t) =>
    t.replace(/\s+/g, ' ').trim()
  );
  return {
    address: new URL(page.url()).pathname.replace(
      /^\/invoices\/([^/]+)\/edit$/,
      (_, id: string) => `/invoices/${id === ws.invoiceId ? '{seeded}' : '{created}'}/edit`
    ),
    dialog: (await dialogOf(page).allInnerTexts()).join('|').replace(/\s+/g, ' ').trim(),
    unsavedFlag: unsaved ? 'Unsaved' : saved ? 'Saved' : 'none',
    saveEnabled: await saveButton(page).isEnabled(),
    fieldError: await page.getByText('Quantity must be greater than zero.').isVisible(),
    messages,
  };
}

async function reachOutcome(
  browser: Browser,
  testInfo: TestInfo,
  scenario: Scenario,
  path: Path
) {
  const f = await openSignedInFreelancer(browser, testInfo, `eux-t20-${path}`, {
    seed: { timeZone: 'UTC', status: 'DRAFT' },
    context: { viewport: { width: 1280, height: 800 } },
  });
  const { page, workspace: ws } = f;
  try {
    await scenario.open(page, ws);
    await scenario.edit(page, ws);
    await scenario.elsewhere?.(ws);
    const submit = () =>
      scenario.intent === 'save-and-issue'
        ? page.getByRole('button', { name: 'Save and issue' }).click()
        : saveButton(page).click();

    if (path === 'save') {
      await scenario.late?.(page);
      await submit();
    } else {
      await failNextSave(page);
      await submit();
      await expect(toastOf(page, FORCED_FAILURE_MESSAGE)).toBeVisible();
      // Nothing was sent, so nothing is stored and the form is still unsaved.
      await expect(page.getByText('Unsaved', { exact: true })).toBeVisible();
      await scenario.late?.(page);
      await toastOf(page, FORCED_FAILURE_MESSAGE).getByRole('button', { name: 'Retry' }).click();
      await expect(toastOf(page, FORCED_FAILURE_MESSAGE)).toHaveCount(0);
    }
    await scenario.settled(page);
    const observation = await observe(page, ws);
    return { f, page, ws, observation };
  } catch (error) {
    await f.context.close();
    throw error;
  }
}

for (const scenario of Object.values(scenarios)) {
  test(`AC-05c/05d: ${scenario.label} - Retry shows the same address, dialog and unsaved flag as Save`, async ({
    browser,
  }, testInfo) => {
    const bySave = await reachOutcome(browser, testInfo, scenario, 'save');
    const byRetry = await reachOutcome(browser, testInfo, scenario, 'retry');
    try {
      expect(byRetry.observation).toEqual(bySave.observation);

      const stored = async (r: typeof bySave) => {
        const invoices = await readInvoicesOf(r.ws.userId);
        return invoices.map((i) => ({
          status: i.status,
          notes: i.notes,
          quantity: i.items.map((item) => item.quantity.toString()),
          total: i.total.toString(),
        }));
      };
      // What was stored is the same too, including the change made after the failure.
      expect(await stored(byRetry)).toEqual(await stored(bySave));

      if (scenario.label === 'created') {
        await expectCreatedOwnAddress(bySave);
        await expectCreatedOwnAddress(byRetry);
      }
      if (scenario.label === 'updated') {
        const [row] = await readInvoicesOf(byRetry.ws.userId);
        expect(row.notes).toBe('Edited before saving');
        expect(row.items[0].quantity.toString()).toBe('3');
      }
      if (scenario.label === 'issued') {
        const [row] = await readInvoicesOf(byRetry.ws.userId);
        expect(row.status).toBe('PENDING');
      }
      if (scenario.label === 'changed elsewhere') {
        const [row] = await readInvoicesOf(byRetry.ws.userId);
        expect(row.notes).toBeNull();
        await expect(dialogOf(byRetry.page)).toContainText('Reloading discards your unsaved changes.');
        await expect(
          dialogOf(byRetry.page).getByRole('button', { name: 'Reload invoice' })
        ).toBeVisible();
      }
      if (scenario.label === 'totals changed') {
        const dialog = dialogOf(byRetry.page);
        await expect(dialog).toContainText('90.00');
        await expect(dialog).toContainText('100.00');
        const [row] = await readInvoicesOf(byRetry.ws.userId);
        expect(row.notes).toBeNull();
        // Confirming from the retried dialog saves.
        await dialog.getByRole('button', { name: 'Confirm and save' }).click();
        await expect(toastOf(byRetry.page, 'Invoice updated')).toBeVisible();
        expect((await readInvoicesOf(byRetry.ws.userId))[0].notes).toBe('Edited before saving');
      }
      if (scenario.label === 'field error') {
        const [row] = await readInvoicesOf(byRetry.ws.userId);
        expect(row.items[0].quantity.toString()).toBe('1');
      }
    } finally {
      await bySave.f.context.close();
      await byRetry.f.context.close();
    }
  });
}

/** The created invoice has its own editing address: reload opens it and the next Save updates it. */
async function expectCreatedOwnAddress(r: {
  page: Page;
  ws: SeededWorkspace;
}): Promise<void> {
  const before = await readInvoicesOf(r.ws.userId);
  expect(before).toHaveLength(2);
  const created = before.find((i) => i.id !== r.ws.invoiceId)!;
  expect(new URL(r.page.url()).pathname).toBe(protectedRoutes.invoiceEdit(created.id));
  expect(created.notes).toBe(LATE_NOTE);

  await r.page.reload();
  const title = r.page.locator('h1.truncate');
  await expect(title).toHaveText(created.invoiceNumber);
  await expect(notesField(r.page)).toHaveValue(LATE_NOTE);

  await notesField(r.page).fill('Second save');
  await saveButton(r.page).click();
  await expect(toastOf(r.page, 'Invoice updated')).toBeVisible();
  const after = await readInvoicesOf(r.ws.userId);
  expect(after).toHaveLength(2);
  expect(after.find((i) => i.id === created.id)!.notes).toBe('Second save');
}
