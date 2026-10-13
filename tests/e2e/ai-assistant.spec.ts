// AC-01, AC-13, AC-23, AC-33 (test-plan.md, e2e-through-UI): the AI section from the sidebar, a
// streamed answer, a Draft card created once, the Assistant mark until the draft is issued, and
// "Create with AI" from the invoice list. The production build answers from the scripted stub model
// (tests/e2e/support/ai-stub.ts); no real provider is called.
import { test, expect, type Page } from '@playwright/test';
import { APP_E2E_URL } from './support/app-server';
import {
  openSignedInFreelancer,
  type SignedInFreelancer,
} from './support/signed-in';
import { protectedRoutes } from '../../config/routes.config';

test.describe.configure({ mode: 'serial', timeout: 150_000 });

const AC12_SENTENCE = 'Invoice Acme for 20 hours of consulting at $50';

test.describe('AI assistant: ask, draft, create, review, issue', () => {
  let freelancer: SignedInFreelancer;
  let page: Page;

  test.beforeAll(async ({ browser }, testInfo) => {
    test.setTimeout(240_000);
    freelancer = await openSignedInFreelancer(browser, testInfo, 'ai-chat', {
      seed: { customerName: 'Acme Corp' },
      context: { timezoneId: 'UTC' },
    });
    page = freelancer.page;
  });

  test.afterAll(async () => {
    await freelancer?.context.close();
  });

  test('AC-01: the sidebar opens the AI section, ready with nothing to set up', async () => {
    await page.goto(`${APP_E2E_URL}${protectedRoutes.dashboard}`);
    await page.getByRole('link', { name: 'AI chat', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${protectedRoutes.ai}$`));
    await expect(
      page.getByRole('heading', { name: 'Hi! What can I help you with?' })
    ).toBeVisible();
    // ai-chat-v2 T20 (SCR-02): the fixed suggested requests.
    for (const example of [
      'Invoice Acme for 20 hours of consulting at $50',
      'Who owes me money right now?',
      "What's overdue today?",
      'Which bank accounts do I have?',
    ]) {
      await expect(page.getByRole('button', { name: example })).toBeVisible();
    }
    await expect(page.getByText('30 of 30 messages left today')).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Connect your own AI client →' })
    ).toHaveAttribute('href', protectedRoutes.settingsAssistants);
    await expect(page.getByRole('textbox', { name: 'Message' })).toBeEnabled();
  });

  test('AC-01: a question is answered in the chat, with a link, and the allowance counts it', async () => {
    // ai-chat-v2 T20: no longer a suggested request; typed instead.
    await page.getByRole('textbox', { name: 'Message' }).fill('Where do I change the logo on my invoices?');
    await expect(page.getByRole('textbox', { name: 'Message' })).toHaveValue(
      'Where do I change the logo on my invoices?'
    );
    // Fix 2026-10-12 (chat-reloads-on-send): the reply is appended in place. Count loading skeletons added and
    // messages removed: a navigation to /ai/{id} shows the route's skeleton and remounts (removes) the chat.
    await page.evaluate(() => {
      const w = window as unknown as { __chat?: { skeletons: number; removed: number } };
      const chat = { skeletons: 0, removed: 0 };
      w.__chat = chat;
      const has = (n: Node, selector: string) =>
        n instanceof Element && (n.matches(selector) || n.querySelector(selector) !== null);
      new MutationObserver((records) => {
        for (const r of records) {
          for (const n of Array.from(r.addedNodes)) if (has(n, '[data-slot="skeleton"]')) chat.skeletons += 1;
          for (const n of Array.from(r.removedNodes)) if (has(n, '[data-role]')) chat.removed += 1;
        }
      }).observe(document.body, { childList: true, subtree: true });
    });
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page).toHaveURL(/\/ai\/[^/?]+$/);
    // The bubble only: the chat also keeps a screen-reader live region ("Assistant replied: ...").
    await expect(
      page.getByText('You can set the logo on your sender profile.', { exact: true })
    ).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Message' })).toBeEnabled();
    await page.waitForLoadState('networkidle');
    const chat = await page.evaluate(() => (window as unknown as { __chat?: unknown }).__chat);
    expect(chat).toEqual({ skeletons: 0, removed: 0 });
    await expect(
      page.getByRole('main').getByRole('link', { name: /sender profile/i }).first()
    ).toBeVisible();
    await expect(page.getByText('29 of 30 messages left today')).toBeVisible();
  });

  test('AC-33: "Create with AI" on the invoice list opens a Conversation ready to draft', async () => {
    await page.goto(`${APP_E2E_URL}${protectedRoutes.invoices}`);
    await page.getByRole('link', { name: 'Create with AI' }).click();
    await expect(page).toHaveURL(/\/ai\?start=draft&from=invoices$/);
    await expect(
      page.getByRole('heading', { name: 'Draft an invoice' })
    ).toBeVisible();
    await expect(page.getByRole('button', { name: AC12_SENTENCE })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Message' })).toHaveAttribute(
      'placeholder',
      `e.g. "${AC12_SENTENCE}"`
    );
    await expect(page.getByText(/messages left today/)).toBeVisible();
  });

  let draftNumber = '';

  test('AC-13: the card is created once and the chat links to the Draft invoice', async () => {
    await page.getByRole('button', { name: AC12_SENTENCE }).click();
    await page.getByRole('button', { name: 'Send', exact: true }).click();

    await expect(page.getByText('Draft invoice').first()).toBeVisible();
    await expect(page.getByText('Acme Corp').first()).toBeVisible();
    await expect(page.getByText('1,000.00 USD').first()).toBeVisible();
    const create = page.getByRole('button', { name: 'Create draft' });
    await expect(create).toBeVisible();
    await create.click();
    // A second press cannot fire: the button is disabled or already gone.
    await expect(create).toHaveCount(0);

    const created = page.getByText(/Draft [A-Z0-9-]+ created\./);
    await expect(created).toBeVisible();
    draftNumber = (await created.innerText()).match(/Draft (\S+) created\./)![1];
    await expect(page.getByText('Created', { exact: true })).toBeVisible();

    await page.getByRole('link', { name: 'Open in editor →' }).click();
    await expect(page).toHaveURL(/\/invoices\/[^/]+\/edit$/);
  });

  test('AC-23: the draft is marked AI in the editor header and the invoice list, once', async () => {
    await expect(page.getByText('AI', { exact: true })).toBeVisible();
    await page.getByText('AI', { exact: true }).hover();
    await expect(page.getByText('Created by the in-app chat').first()).toBeVisible();

    await page.goto(`${APP_E2E_URL}${protectedRoutes.invoices}`);
    const rows = page.getByRole('row').filter({ hasText: draftNumber });
    await expect(rows).toHaveCount(1);
    await expect(rows.getByText('AI', { exact: true })).toBeVisible();
    // Pressing Create created exactly one new invoice next to the seeded one.
    await expect(page.getByRole('row').filter({ hasText: 'Acme Corp' })).toHaveCount(2);
  });

  test('AC-23: once issued the visible mark is gone', async () => {
    await page
      .getByRole('row')
      .filter({ hasText: draftNumber })
      .getByRole('link')
      .first()
      .click();
    await expect(page).toHaveURL(/\/invoices\/[^/]+\/edit$/);
    await page.getByRole('button', { name: 'Save and issue' }).click();
    await expect(page.getByRole('button', { name: 'Save and issue' })).toHaveCount(0);
    await expect(page.getByText('AI', { exact: true })).toHaveCount(0);

    await page.goto(`${APP_E2E_URL}${protectedRoutes.invoices}`);
    const row = page.getByRole('row').filter({ hasText: draftNumber });
    await expect(row).toHaveCount(1);
    await expect(row.getByText('AI', { exact: true })).toHaveCount(0);
  });
});
