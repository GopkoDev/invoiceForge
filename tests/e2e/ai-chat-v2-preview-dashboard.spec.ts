// ai-chat-v2 T31 (test-plan.md §Levels "E2E-through-UI"; ux-flows US-07..US-10, US-12): the invoice preview and
// issue from the chat (incl. the two-tab cases), the preview address (?preview= pushed onto history: Back closes,
// reload reopens), the column at >= 768 px and the full-screen sheet below, the navigation "AI" group, the
// dashboard prompt hand-off (no start screen on the way), the latest Conversations and Create invoice with AI, and
// the anonymous privacy page. Plus the SCR-06 (1440 x 900) and SCR-09 Linux baselines.
import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import type { PrismaClient } from '@prisma/client';
import { createTestPrismaClient } from '../support/db/client';
import { createConversation } from '../support/factories/conversation';
import { APP_E2E_URL, SNAPSHOT_PLATFORM, readE2eRuntime } from './support/app-server';
import { openSignedInFreelancer } from './support/signed-in';
import { listRow, notesField, openEditor, openInvoiceList } from './support/invoice-ui';
import { legalRoutes, protectedRoutes } from '../../config/routes.config';
import { STREAMED_REPLY } from '../../lib/ai/e2e-stub-model';

test.describe.configure({ timeout: 150_000 });

const DRAFT_SENTENCE = 'Invoice Acme for 20 hours of consulting at $50';
const WIDE = { width: 1440, height: 900 };
const DESKTOP = { width: 1280, height: 800 };
const ALREADY_ISSUED = 'This invoice has already been issued.';
const OUTDATED = 'This draft was changed after you opened the preview. Check it and issue again.';

const message = (page: Page) => page.getByRole('textbox', { name: 'Message' });
const send = (page: Page) => page.getByRole('button', { name: 'Send', exact: true });
const panel = (page: Page) => page.locator('[data-slot="invoice-preview-panel"]');
const issueButton = (page: Page) => panel(page).getByRole('button', { name: 'Issue invoice' });

async function withDb<T>(run: (prisma: PrismaClient) => Promise<T>): Promise<T> {
  const prisma = createTestPrismaClient(readE2eRuntime().databaseUrl);
  try {
    return await run(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

const readInvoice = (invoiceNumber: string) =>
  withDb((prisma) =>
    prisma.invoice.findFirstOrThrow({
      where: { invoiceNumber },
      select: { id: true, status: true, version: true, issuedAt: true, issuedFromChat: true, invoiceNumber: true },
    })
  );

/** Drafts and creates the Acme Corp invoice from the chat; returns its number and id. */
async function createDraftFromChat(page: Page): Promise<{ invoiceNumber: string; invoiceId: string }> {
  await page.goto(`${APP_E2E_URL}${protectedRoutes.ai}?start=draft`);
  await message(page).fill(DRAFT_SENTENCE);
  await send(page).click();
  await page.getByRole('button', { name: 'Create draft' }).click();
  const created = page.getByText(/^Draft [A-Z0-9-]+ created\.$/);
  await expect(created).toBeVisible();
  const invoiceNumber = (await created.textContent())!.match(/^Draft (\S+) created\.$/)![1];
  const { id } = await readInvoice(invoiceNumber);
  return { invoiceNumber, invoiceId: id };
}

async function openPreviewFromCard(page: Page, invoiceNumber: string): Promise<number> {
  const started = Date.now();
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(panel(page).getByRole('heading', { name: invoiceNumber })).toBeVisible();
  await expect(panel(page).getByRole('status').filter({ hasText: 'Loading preview…' })).toHaveCount(0);
  return Date.now() - started;
}

async function confirmIssue(page: Page, invoiceNumber: string) {
  await issueButton(page).click();
  const dialog = page.getByRole('dialog', { name: `Issue invoice ${invoiceNumber}?` });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Issue invoice' }).click();
  await expect(dialog).toBeHidden();
}

test('AC-20 / AC-23: Preview opens beside the messages within 1.5 s; Issue after confirming updates panel, card and list, and keeps the number', async ({
  browser,
}, testInfo) => {
  testInfo.setTimeout(240_000);
  const f = await openSignedInFreelancer(browser, testInfo, 'ai-v2-issue', {
    seed: { customerName: 'Acme Corp', timeZone: 'UTC' },
    context: { timezoneId: 'UTC', viewport: WIDE },
  });
  try {
    const { page } = f;
    const { invoiceNumber, invoiceId } = await createDraftFromChat(page);

    const ms = await openPreviewFromCard(page, invoiceNumber);
    testInfo.annotations.push({ type: 'preview-open-ms', description: String(ms) });
    expect(ms).toBeLessThanOrEqual(1500);
    await expect(page).toHaveURL(/\?preview=[^&]+$/);
    await expect(page.locator('[data-slot="preview-column"]')).toBeVisible();
    await expect(page.locator('[data-role="user"]').first()).toBeInViewport();
    await expect(panel(page).getByText('Draft', { exact: true })).toBeVisible();
    await expect(panel(page).getByRole('link', { name: 'Open in editor' })).toHaveAttribute(
      'href',
      protectedRoutes.invoiceEdit(invoiceId)
    );

    await issueButton(page).click();
    const dialog = page.getByRole('dialog', { name: `Issue invoice ${invoiceNumber}?` });
    await expect(dialog).toContainText('Acme Corp');
    await expect(dialog).toContainText('1,000.00 USD');
    await expect(dialog).toContainText("Once it's issued, its lines and amounts can no longer change.");
    await dialog.getByRole('button', { name: 'Issue invoice' }).click();
    await expect(page.getByText(`Invoice ${invoiceNumber} issued.`)).toBeVisible();

    // The panel, the card and the stored invoice agree: issued, same number, from the chat.
    await expect(panel(page).getByText('Pending', { exact: true })).toBeVisible();
    await expect(issueButton(page)).toHaveCount(0);
    await expect(page.locator(`[id^="draft-card-"]`).getByText(`Invoice ${invoiceNumber}`)).toBeVisible();
    const stored = await readInvoice(invoiceNumber);
    expect(stored).toMatchObject({ id: invoiceId, status: 'PENDING', invoiceNumber, issuedFromChat: true });
    expect(stored.issuedAt).not.toBeNull();

    // The Assistant-draft mark is gone from the list, as for any issued Assistant draft.
    await openInvoiceList(page);
    await expect(listRow(page, invoiceNumber).getByText('AI', { exact: true })).toHaveCount(0);
  } finally {
    await f.context.close();
  }
});

// Review 2026-10-13 R1-U2 / R2-U1: once the first reply saved the Conversation, the first Create draft re-renders the
// address as the Conversation page (one remount). The live chat is handed over: unsent text stays, a reply in flight
// finishes in place, and nothing is sent again.
test('Create draft after the first reply keeps unsent text and a reply in flight; nothing is sent again', async ({
  browser,
}, testInfo) => {
  testInfo.setTimeout(240_000);
  const f = await openSignedInFreelancer(browser, testInfo, 'ai-v2-handover', {
    seed: { customerName: 'Acme Corp', timeZone: 'UTC' },
    context: { timezoneId: 'UTC', viewport: DESKTOP },
  });
  try {
    const { page } = f;
    const chatPosts: string[] = [];
    page.on('request', (r) => {
      if (r.method() === 'POST' && new URL(r.url()).pathname === '/api/chat') chatPosts.push(r.url());
    });
    await page.goto(`${APP_E2E_URL}${protectedRoutes.ai}?start=draft`);
    await message(page).fill(DRAFT_SENTENCE);
    await send(page).click();
    const create = page.getByRole('button', { name: 'Create draft' });
    await expect(create).toBeVisible();
    await expect(page).toHaveURL(/\/ai\/[^/?]+$/);

    // A follow-up streams for about a second; Create is pressed while it does.
    await message(page).fill('How do payment reminders work?');
    await send(page).click();
    await expect(page.locator('[data-role="assistant"]').last()).toContainText(STREAMED_REPLY[0].trim().split(' ')[0]);
    await create.click();
    await expect(page.getByText(/^Draft [A-Z0-9-]+ created\.$/)).toBeVisible();
    await expect(page.locator('[data-role="assistant"]').last()).toHaveText(STREAMED_REPLY.join('').trim());
    await expect(page.locator('[data-role="user"]').first()).toHaveText(DRAFT_SENTENCE);

    // Unsent text typed now survives any later refresh of the page's data (the Conversation page is in place).
    await message(page).fill('unsent words');
    await page.waitForTimeout(500);
    await expect(message(page)).toHaveValue('unsent words');
    expect(chatPosts).toHaveLength(2);
  } finally {
    await f.context.close();
  }
});

test('Create draft after the first reply keeps text typed but not sent', async ({ browser }, testInfo) => {
  testInfo.setTimeout(240_000);
  const f = await openSignedInFreelancer(browser, testInfo, 'ai-v2-handover-text', {
    seed: { customerName: 'Acme Corp', timeZone: 'UTC' },
    context: { timezoneId: 'UTC', viewport: DESKTOP },
  });
  try {
    const { page } = f;
    await page.goto(`${APP_E2E_URL}${protectedRoutes.ai}?start=draft`);
    await message(page).fill(DRAFT_SENTENCE);
    await send(page).click();
    const create = page.getByRole('button', { name: 'Create draft' });
    await expect(create).toBeVisible();
    await message(page).fill('also add a note');
    await create.click();
    await expect(page.getByText(/^Draft [A-Z0-9-]+ created\.$/)).toBeVisible();
    await page.waitForTimeout(500);
    await expect(message(page)).toHaveValue('also add a note');
    await expect(page.locator('[data-role="user"]').first()).toHaveText(DRAFT_SENTENCE);
  } finally {
    await f.context.close();
  }
});

test('the preview address: ?preview= opens with a history entry, Back closes it, a reload reopens it, Close drops it', async ({
  browser,
}, testInfo) => {
  testInfo.setTimeout(240_000);
  const f = await openSignedInFreelancer(browser, testInfo, 'ai-v2-preview-url', {
    seed: { customerName: 'Acme Corp', timeZone: 'UTC' },
    context: { timezoneId: 'UTC', viewport: WIDE },
  });
  try {
    const { page } = f;
    const { invoiceNumber } = await createDraftFromChat(page);
    await expect(page).toHaveURL(/\/ai\/[^/?]+$/);
    const conversationUrl = page.url();
    // Once the Create action has settled the address is still the Conversation's (it used to fall back to
    // /ai?start=draft), and a reload shows the Conversation with its created card.
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(conversationUrl);
    await page.reload();
    await expect(page.getByText(`Draft ${invoiceNumber} created.`)).toBeVisible();

    await openPreviewFromCard(page, invoiceNumber);
    await expect(page).toHaveURL(/\?preview=/);
    const previewUrl = page.url();
    await expect(page.getByRole('button', { name: 'Preview', exact: true })).toHaveAttribute('aria-expanded', 'true');

    await page.goBack();
    await expect(page).toHaveURL(conversationUrl);
    await expect(panel(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Preview', exact: true })).toHaveAttribute('aria-expanded', 'false');

    await page.goForward();
    await expect(page).toHaveURL(previewUrl);
    await expect(panel(page).getByRole('heading', { name: invoiceNumber })).toBeVisible();

    await page.reload();
    await expect(panel(page).getByRole('heading', { name: invoiceNumber })).toBeVisible();

    // Opened by the address itself (no pushed entry): Close drops the parameter in place.
    await panel(page).getByRole('button', { name: 'Close preview' }).click();
    await expect(page).toHaveURL(conversationUrl);
    await expect(panel(page)).toHaveCount(0);
  } finally {
    await f.context.close();
  }
});

test('AC-19 / SCR-06: at 768 px the preview is a column beside the messages; below 768 px a full-screen sheet with the same actions', async ({
  browser,
}, testInfo) => {
  testInfo.setTimeout(240_000);
  const f = await openSignedInFreelancer(browser, testInfo, 'ai-v2-preview-sizes', {
    seed: { customerName: 'Acme Corp', timeZone: 'UTC' },
    context: { timezoneId: 'UTC', viewport: DESKTOP },
  });
  try {
    const { page } = f;
    const { invoiceNumber } = await createDraftFromChat(page);
    const previewUrl = async () => {
      await openPreviewFromCard(page, invoiceNumber);
      return page.url();
    };
    const url = await previewUrl();

    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(url);
    await expect(page.locator('[data-slot="preview-column"]')).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Invoice preview' })).toHaveCount(0);
    await expect(panel(page).getByRole('heading', { name: invoiceNumber })).toBeVisible();
    await expect(page.locator('[data-role="user"]').first()).toBeVisible();

    await page.setViewportSize({ width: 767, height: 1024 });
    const sheet = page.getByRole('dialog', { name: 'Invoice preview' });
    await expect(sheet).toBeVisible();
    await expect(page.locator('[data-slot="preview-column"]')).toHaveCount(0);

    await page.setViewportSize({ width: 360, height: 640 });
    await page.goto(url);
    await expect(sheet).toBeVisible();
    // Full-screen: the sheet fills exactly the viewport, its heading and Close at the top in view.
    await expect.poll(async () => JSON.stringify(await sheet.boundingBox())).toBe(
      JSON.stringify({ x: 0, y: 0, width: 360, height: 640 })
    );
    await expect(sheet.getByRole('heading', { name: invoiceNumber })).toBeInViewport();
    await expect(sheet.getByRole('button', { name: 'Close preview' })).toBeInViewport();
    await expect(sheet.getByRole('link', { name: 'Open in editor' })).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Issue invoice' })).toBeVisible();
    await sheet.getByRole('button', { name: 'Close preview' }).click();
    await expect(sheet).toBeHidden();
    await expect(page).not.toHaveURL(/preview=/);
  } finally {
    await f.context.close();
  }
});

async function twoTabs(context: BrowserContext, page: Page) {
  const { invoiceNumber, invoiceId } = await createDraftFromChat(page);
  await openPreviewFromCard(page, invoiceNumber);
  const before = await readInvoice(invoiceNumber);
  const editorTab = await context.newPage();
  await openEditor(editorTab, invoiceId);
  return { invoiceNumber, invoiceId, before, editorTab };
}

test('AC-26: issued in the editor in another tab, then Issue in the chat preview: nothing is issued again; panel and card show it issued', async ({
  browser,
}, testInfo) => {
  testInfo.setTimeout(240_000);
  const f = await openSignedInFreelancer(browser, testInfo, 'ai-v2-two-tabs-issued', {
    seed: { customerName: 'Acme Corp', timeZone: 'UTC' },
    context: { timezoneId: 'UTC', viewport: WIDE },
  });
  try {
    const { page, context } = f;
    const { invoiceNumber, editorTab } = await twoTabs(context, page);

    await editorTab.getByRole('button', { name: 'Save and issue' }).click();
    await expect.poll(async () => (await readInvoice(invoiceNumber)).status).toBe('PENDING');
    const issuedOnce = await readInvoice(invoiceNumber);
    await editorTab.close();

    await confirmIssue(page, invoiceNumber);
    await expect(panel(page).getByText(ALREADY_ISSUED)).toBeVisible();
    await expect(panel(page).getByText('Pending', { exact: true })).toBeVisible();
    await expect(issueButton(page)).toHaveCount(0);
    await expect(page.locator(`[id^="draft-card-"]`).getByText(`Invoice ${invoiceNumber}`)).toBeVisible();
    const after = await readInvoice(invoiceNumber);
    expect(after.issuedAt?.toISOString()).toBe(issuedOnce.issuedAt?.toISOString());
    expect(after.version).toBe(issuedOnce.version);
    expect(after.issuedFromChat).toBe(false);
  } finally {
    await f.context.close();
  }
});

test('AC-26b: changed in the editor in another tab, then Issue in the chat preview: nothing is issued; the preview reloads and a new confirmation issues it', async ({
  browser,
}, testInfo) => {
  testInfo.setTimeout(240_000);
  const f = await openSignedInFreelancer(browser, testInfo, 'ai-v2-two-tabs-changed', {
    seed: { customerName: 'Acme Corp', timeZone: 'UTC' },
    context: { timezoneId: 'UTC', viewport: WIDE },
  });
  try {
    const { page, context } = f;
    const { invoiceNumber, before, editorTab } = await twoTabs(context, page);

    await notesField(editorTab).fill('Changed in the other tab');
    await editorTab.getByRole('button', { name: 'Save', exact: true }).click();
    await expect.poll(async () => (await readInvoice(invoiceNumber)).version).toBeGreaterThan(before.version);
    await editorTab.close();

    await confirmIssue(page, invoiceNumber);
    await expect(panel(page).getByText(OUTDATED)).toBeVisible();
    expect((await readInvoice(invoiceNumber)).status).toBe('DRAFT');
    await expect(issueButton(page)).toBeEnabled();

    // Issue again from the reloaded preview, after a new confirmation naming the current invoice.
    await confirmIssue(page, invoiceNumber);
    await expect(page.getByText(`Invoice ${invoiceNumber} issued.`)).toBeVisible();
    await expect(panel(page).getByText('Pending', { exact: true })).toBeVisible();
    expect((await readInvoice(invoiceNumber)).status).toBe('PENDING');
  } finally {
    await f.context.close();
  }
});

test('AC-28: the navigation "AI" group holds AI chat and Connect your AI; each opens its page and is marked active', async ({
  browser,
}, testInfo) => {
  testInfo.setTimeout(240_000);
  const f = await openSignedInFreelancer(browser, testInfo, 'ai-v2-nav', {
    seed: { timeZone: 'UTC' },
    context: { timezoneId: 'UTC', viewport: DESKTOP },
  });
  try {
    const { page } = f;
    await page.goto(`${APP_E2E_URL}${protectedRoutes.dashboard}`);
    const sidebar = page.locator('[data-sidebar="sidebar"]').first();
    const group = sidebar.locator('[data-sidebar="group"]').filter({ has: page.getByText('AI', { exact: true }) });
    await expect(group.getByRole('link')).toHaveText(['AI chat', 'Connect your AI']);
    const management = sidebar.locator('[data-sidebar="group-label"]').filter({ hasText: 'Management' });
    const aiLabel = group.locator('[data-sidebar="group-label"]');
    await expect(aiLabel).toHaveClass((await management.getAttribute('class'))!);

    await group.getByRole('link', { name: 'AI chat' }).click();
    await expect(page).toHaveURL(new RegExp(`${protectedRoutes.ai}$`));
    await expect(group.locator('[data-active="true"]')).toHaveText('AI chat');

    await group.getByRole('link', { name: 'Connect your AI' }).click();
    await expect(page).toHaveURL(new RegExp(`${protectedRoutes.settingsAssistants}$`));
    await expect(page.getByRole('heading', { name: 'Connect your AI', level: 1 })).toBeVisible();
    await expect(group.locator('[data-active="true"]')).toHaveText('Connect your AI');
  } finally {
    await f.context.close();
  }
});

test('AC-29: a dashboard prompt opens a new Conversation with the message already sent, without the start screen, counted once', async ({
  browser,
}, testInfo) => {
  testInfo.setTimeout(240_000);
  const f = await openSignedInFreelancer(browser, testInfo, 'ai-v2-dashboard-prompt', {
    seed: { timeZone: 'UTC' },
    context: { timezoneId: 'UTC', viewport: DESKTOP },
  });
  try {
    const { page, workspace } = f;
    // Records whether the empty-state start screen is ever attached on the way to the Conversation.
    await page.addInitScript(() => {
      const w = window as unknown as { __sawStart?: boolean };
      new MutationObserver(() => {
        if (document.querySelector('[data-slot="start-panel"]')) w.__sawStart = true;
      }).observe(document, { childList: true, subtree: true });
    });
    await page.goto(`${APP_E2E_URL}${protectedRoutes.dashboard}`);
    const block = page.locator('[data-slot="dashboard-ai-block"]');
    await block.getByRole('textbox', { name: 'Message to AI' }).fill('who owes me money?');
    await block.getByRole('button', { name: 'Send to AI' }).click();

    await expect(page).toHaveURL(/\/ai\/[^/?]+$/);
    await expect(page.locator('[data-role="user"]')).toHaveText(['who owes me money?']);
    await expect(page.locator('[data-role="assistant"]')).toHaveCount(1);
    expect(await page.evaluate(() => (window as unknown as { __sawStart?: boolean }).__sawStart ?? false)).toBe(false);
    expect(page.url()).not.toContain('handoff');

    await withDb(async (prisma) => {
      const conversations = await prisma.conversation.findMany({
        where: { userId: workspace.userId },
        include: { messages: { where: { role: 'USER' } } },
      });
      expect(conversations).toHaveLength(1);
      expect(conversations[0].startedFrom).toBe('DASHBOARD_PROMPT');
      expect(conversations[0].messages.map((m) => m.origin)).toEqual(['DASHBOARD']);
      const days = await prisma.messageAllowanceDay.findMany({ where: { userId: workspace.userId } });
      expect(days.reduce((n, d) => n + d.used, 0)).toBe(1);
    });

    // Back to the dashboard and forward again: the hand-off is not sent a second time.
    await page.goBack();
    await page.goForward();
    await expect(page.locator('[data-role="user"]')).toHaveCount(1);
    expect(await withDb((prisma) => prisma.conversation.count({ where: { userId: workspace.userId } }))).toBe(1);
  } finally {
    await f.context.close();
  }
});

test('AC-30: the dashboard lists the three latest Conversations, links to all, and Create invoice with AI opens a drafting Conversation', async ({
  browser,
}, testInfo) => {
  testInfo.setTimeout(240_000);
  const f = await openSignedInFreelancer(browser, testInfo, 'ai-v2-dashboard-latest', {
    seed: { timeZone: 'UTC' },
    context: { timezoneId: 'UTC', viewport: DESKTOP },
  });
  try {
    const { page, workspace } = f;
    await page.goto(`${APP_E2E_URL}${protectedRoutes.dashboard}`);
    const block = page.locator('[data-slot="dashboard-ai-block"]');
    await expect(block.getByText('No conversations yet. Your chats with AI will show here.')).toBeVisible();

    const ids = await withDb(async (prisma) => {
      const out: string[] = [];
      for (let i = 1; i <= 5; i++) {
        const c = await createConversation(prisma, {
          userId: workspace.userId,
          title: `Conversation ${i}`,
          lastMessageAt: new Date(Date.now() - (6 - i) * 3600_000),
          messages: [{ role: 'USER', text: `Question ${i}` }, { role: 'ASSISTANT', text: `Answer ${i}` }],
        });
        out.push(c.id);
      }
      return out;
    });

    await page.reload();
    const recent = block.getByRole('list', { name: 'Recent conversations' });
    await expect(recent.getByRole('link')).toHaveCount(3);
    await expect(recent.getByRole('link')).toContainText(['Conversation 5', 'Conversation 4', 'Conversation 3']);
    await expect(block.getByRole('link', { name: 'All conversations →' })).toHaveAttribute('href', protectedRoutes.ai);

    await recent.getByRole('link', { name: /Conversation 4/ }).click();
    await expect(page).toHaveURL(new RegExp(`/ai/${ids[3]}$`));
    await expect(page.locator('[data-role="user"]')).toHaveText(['Question 4']);

    await page.goto(`${APP_E2E_URL}${protectedRoutes.dashboard}`);
    await page.getByRole('link', { name: 'Create invoice with AI' }).click();
    await expect(page).toHaveURL(/\/ai\?start=draft&from=dashboard$/);
    await expect(page.getByRole('heading', { name: 'Draft an invoice' })).toBeVisible();
  } finally {
    await f.context.close();
  }
});

test('AC-35: a Visitor reads the privacy page AI section without signing in', async ({ browser }) => {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const response = await page.goto(`${APP_E2E_URL}${legalRoutes.privacy}`);
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(new RegExp(`${legalRoutes.privacy}$`));
    const section = page.getByRole('heading', { name: '11. AI assistant' }).locator('..');
    await expect(section).toContainText('options the chat offered as buttons and the one you chose');
    await expect(section).toContainText('90 days after its last message');
    await expect(section).toContainText('Google Gemini model through the Vercel AI Gateway');
    await expect(section).toContainText('never a full account number');
  } finally {
    await context.close();
  }
});

test.describe('visual baselines: SCR-06 preview at 1440 x 900, SCR-09 dashboard AI block', () => {
  test('SCR-06 and SCR-09', async ({ browser }, testInfo) => {
    test.skip(SNAPSHOT_PLATFORM !== 'linux', 'Baselines are Linux-only (CI image); see tests/e2e/README.md');
    testInfo.setTimeout(240_000);
    const f = await openSignedInFreelancer(browser, testInfo, 'ai-v2-visual-preview', {
      seed: { customerName: 'Acme Corp', timeZone: 'UTC' },
      context: { timezoneId: 'UTC', viewport: WIDE },
    });
    try {
      const { page } = f;
      const shot = { maxDiffPixelRatio: 0.002, animations: 'disabled' as const };
      const volatile = () => [
        page.getByText(/@example\.test/),
        page.getByText(/\b[A-Z][a-z]{2} \d{1,2}, \d{4}\b/),
        page.getByText(/\b\d{1,2} [A-Z][a-z]{2} \d{4}\b/),
        page.getByText(/\d{2}\/\d{2}\/\d{4}/),
        // The document is the editor's shared preview (its own baselines); its seeded e-mail wraps unevenly.
        panel(page).locator(':scope > div'),
      ];

      const { invoiceNumber } = await createDraftFromChat(page);
      await openPreviewFromCard(page, invoiceNumber);
      await page.waitForLoadState('networkidle');
      // The number's prefix is random (and unique per account); its width would move the badge and the document's
      // header block, so the shown text is set to one fixed number before the shot.
      await page.evaluate((number) => {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (node.textContent?.includes(number)) node.textContent = node.textContent.replaceAll(number, 'INV-2026-0001');
        }
      }, invoiceNumber);
      await expect(page).toHaveScreenshot('ai-v2-preview-panel.png', { ...shot, mask: volatile() });

      await page.setViewportSize(DESKTOP);
      await page.goto(`${APP_E2E_URL}${protectedRoutes.dashboard}`);
      const block = page.locator('[data-slot="dashboard-ai-block"]');
      await expect(block.getByRole('list', { name: 'Recent conversations' })).toBeVisible();
      await page.waitForLoadState('networkidle');
      await expect(block).toHaveScreenshot('ai-v2-dashboard-ai-block.png', { ...shot, mask: volatile() });
    } finally {
      await f.context.close();
    }
  });
});
