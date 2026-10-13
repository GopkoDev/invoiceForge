// ai-chat-v2 T68 (owner feedback revision 2026-10-13; test-plan.md §Revision, e2e-through-UI rows): the Question form end
// to end (AC-08b, AC-37, AC-40), safe Markdown with an in-app link (AC-42), and the workspace layout (AC-50 aligned
// borders, AC-51 stable skeletons, AC-52 the list stays mounted on a switch, AC-53 level avatar). The production build
// answers from the scripted stub model (lib/ai/e2e-stub-model.ts); seeded Conversations carry the stored forms and
// Markdown replies. AC-08 / AC-13 live in ai-chat-v2-chat.spec.ts (rewritten there for the form).
//
// Visual baselines (toHaveScreenshot) are Linux-only and authoritative; see tests/e2e/README.md ("Layout baselines").
import { test, expect, type Page } from '@playwright/test';
import type { PrismaClient } from '@prisma/client';
import { createTestPrismaClient } from '../support/db/client';
import { createBankAccount } from '../support/factories/bank-account';
import { createCustomer } from '../support/factories/customer';
import {
  createConversation,
  type ConversationMessageInput,
} from '../support/factories/conversation';
import {
  APP_E2E_URL,
  SNAPSHOT_PLATFORM,
  readE2eRuntime,
} from './support/app-server';
import { openSignedInFreelancer } from './support/signed-in';
import {
  accountAndPriceQuestions,
  attachForm,
  defaultFormQuestions,
  type FixtureFormQuestion,
} from './support/ai-forms';

test.describe.configure({ timeout: 150_000 });

const AMBIGUOUS = 'invoice Acme for 20 hours at $50';
const DESKTOP = { width: 1280, height: 800 };

const message = (page: Page) => page.getByRole('textbox', { name: 'Message' });
// The composer's Send only: a Question form in the chat has its own Send.
const send = (page: Page) =>
  page
    .locator('[data-slot="composer-dock"], [data-slot="start-composer"]')
    .getByRole('button', { name: 'Send', exact: true });
const userBubbles = (page: Page) => page.locator('[data-role="user"]');
const replies = (page: Page) => page.locator('[data-role="assistant"]');
const allowanceText = (page: Page) =>
  page.getByText(/\d+ of 30 messages left today/).first();
// T79 (AC-55): the Question form is docked above the composer, one question at a time; the last answer sends it.
const questionForm = (page: Page) => page.locator('[data-slot="question-dock"]');

async function withDb<T>(
  run: (prisma: PrismaClient) => Promise<T>
): Promise<T> {
  const prisma = createTestPrismaClient(readE2eRuntime().databaseUrl);
  try {
    return await run(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

const textMessages = (n: number, prefix: string): ConversationMessageInput[] =>
  Array.from({ length: n }, (_, i) => ({
    role: i % 2 === 0 ? ('USER' as const) : ('ASSISTANT' as const),
    text: `${prefix} message ${i + 1}: ${i % 2 === 0 ? 'Who owes me money right now?' : 'Acme Corp owes 1,000.00 USD on one invoice.'}`,
  }));

/** A Conversation whose latest reply carries an unsent form; returns its id. */
async function seedOpenForm(
  prisma: PrismaClient,
  userId: string,
  questions: FixtureFormQuestion[]
): Promise<string> {
  const reply = `e2e-forms-layout-reply-${userId}`;
  const conversation = await createConversation(prisma, {
    userId,
    title: 'Acme draft',
    messages: [
      { role: 'USER', text: AMBIGUOUS },
      { role: 'ASSISTANT', id: reply, text: 'placeholder' },
    ],
  });
  await attachForm(prisma, {
    userId,
    conversationId: conversation.id,
    messageId: reply,
    text: 'I need a few details before I can draft this.',
    questions,
  });
  return conversation.id;
}

test('AC-08b: one form with the Customer and the bank account questions, asked one at a time; the last answer gives the card and counts one message', async ({
  browser,
}, testInfo) => {
  testInfo.setTimeout(240_000);
  const f = await openSignedInFreelancer(browser, testInfo, 'ai-v2-form-two', {
    seed: { customerName: 'Acme Corp', timeZone: 'UTC' },
    context: { timezoneId: 'UTC', viewport: DESKTOP },
  });
  try {
    const { page, workspace } = f;
    // The stub model never writes a bank account, so the live resolver would use the default one silently; the
    // two-question reply is stored (as the chat stores it) and answered through the UI.
    const { id, secondBank } = await withDb(async (prisma) => {
      const gmbh = await createCustomer(prisma, workspace.userId, {
        name: 'Acme GmbH',
      });
      await prisma.bankAccount.updateMany({
        where: { senderProfileId: workspace.senderProfileId },
        data: { currency: 'USD' },
      });
      const firstBank = await prisma.bankAccount.findFirstOrThrow({
        where: { senderProfileId: workspace.senderProfileId },
      });
      const secondBank = await createBankAccount(prisma, workspace.senderProfileId, {
        bankName: 'Second Bank',
        currency: 'USD',
        isDefault: false,
        accountNumber: '9999999999',
      });
      const [customerQ] = defaultFormQuestions([workspace.customerId, gmbh.id]);
      const [bankQ] = accountAndPriceQuestions([firstBank, secondBank]);
      const id = await seedOpenForm(prisma, workspace.userId, [
        customerQ,
        { ...bankQ, questionId: 1 },
      ]);
      return { id, secondBank };
    });

    await page.goto(`${APP_E2E_URL}/ai/${id}`);
    // One form holds both questions, shown one at a time with a pager.
    await expect(questionForm(page)).toHaveCount(1);
    await expect(questionForm(page).getByText('1 of 2')).toBeVisible();
    await expect(questionForm(page).getByText('Which Acme do you mean?')).toBeVisible();
    await expect(
      questionForm(page).getByRole('radiogroup').getByRole('radio')
    ).toHaveText([/Acme Corp/, /Acme GmbH/, /Something else/]);

    // Picking advances; nothing is sent until the last question is answered.
    await questionForm(page)
      .getByRole('radio', { name: /Acme GmbH/ })
      .click();
    await expect(questionForm(page).getByText('2 of 2')).toBeVisible();
    await expect(questionForm(page).getByText('Which account should be paid into?')).toBeVisible();
    await expect(questionForm(page).getByRole('radio')).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Create draft' })).toHaveCount(0);
    await questionForm(page)
      .getByRole('radio', { name: /Second Bank/ })
      .click();

    await expect(page.getByRole('button', { name: 'Create draft' })).toBeVisible();
    await expect(userBubbles(page).last()).toContainText('Which Acme do you mean? — Acme GmbH');
    await expect(userBubbles(page).last()).toContainText('Which account should be paid into? — Second Bank');
    // That one Send counted as one message.
    await expect(allowanceText(page)).toHaveText('29 of 30 messages left today');
    await withDb(async (prisma) => {
      const card = await prisma.draftCard.findFirstOrThrow({
        where: { userId: workspace.userId },
      });
      expect(JSON.stringify(card.proposal)).toContain(secondBank.id);
      const sent = await prisma.conversationMessage.findMany({
        where: { conversationId: id, role: 'USER', origin: 'FORM' },
      });
      expect(sent).toHaveLength(1);
    });
  } finally {
    await f.context.close();
  }
});

test('AC-37: a typed "Something else" answer, a typed price and a skip go in one send; one message is counted, one line per answer, then the card', async ({
  browser,
}, testInfo) => {
  testInfo.setTimeout(240_000);
  const f = await openSignedInFreelancer(browser, testInfo, 'ai-v2-form-typed', {
    seed: { customerName: 'Acme Corp', timeZone: 'UTC' },
    context: { timezoneId: 'UTC', viewport: DESKTOP },
  });
  try {
    const { page, workspace } = f;
    const id = await withDb(async (prisma) => {
      const gmbh = await createCustomer(prisma, workspace.userId, {
        name: 'Acme GmbH',
      });
      const questions = defaultFormQuestions([workspace.customerId, gmbh.id]);
      questions.push({
        questionId: 2,
        field: 'PO_NUMBER',
        lineIndex: null,
        heading: 'PO number',
        prompt: 'PO number?',
        options: [],
        input: 'TEXT',
        required: false,
        skippable: true,
        matchCount: null,
        source: 'CHAT',
      });
      return seedOpenForm(prisma, workspace.userId, questions);
    });

    await page.goto(`${APP_E2E_URL}/ai/${id}`);
    await expect(questionForm(page)).toBeVisible();
    await expect(questionForm(page).getByText('1 of 3')).toBeVisible();

    // Customer by "Something else": the input opens and takes the typed name.
    await questionForm(page).getByRole('radio', { name: 'Something else' }).click();
    const typedCustomer = questionForm(page).getByRole('textbox', {
      name: 'Something else',
    });
    await expect(typedCustomer).toBeFocused();
    await typedCustomer.fill('Acme GmbH');
    await typedCustomer.press('Enter');

    // Price is typed only; a bad amount is stopped in the form, next to the question.
    await expect(questionForm(page).getByText('2 of 3')).toBeVisible();
    const price = questionForm(page).getByRole('textbox', {
      name: 'What is the hourly price?',
    });
    await price.fill('abc');
    await price.press('Enter');
    await expect(questionForm(page).getByRole('alert')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create draft' })).toHaveCount(0);
    await price.fill('62.5');
    await expect(questionForm(page).getByRole('alert')).toHaveCount(0);
    await price.press('Enter');

    // The optional question is skipped, which sends the form.
    await expect(questionForm(page).getByText('3 of 3')).toBeVisible();
    await questionForm(page).getByRole('button', { name: 'Skip' }).click();

    const sentLines = await userBubbles(page)
      .last()
      .evaluate((el) => (el as HTMLElement).innerText.split('\n'));
    expect(sentLines).toEqual([
      'Which Acme do you mean? — Acme GmbH',
      'What is the hourly price? — 62.5',
      'PO number? — Skipped',
    ]);
    await expect(page.getByRole('button', { name: 'Create draft' })).toBeVisible();
    await expect(allowanceText(page)).toHaveText('29 of 30 messages left today');
    await withDb(async (prisma) => {
      const sent = await prisma.conversationMessage.findMany({
        where: { conversationId: id, role: 'USER' },
        orderBy: { position: 'asc' },
      });
      expect(sent.map((m) => m.origin)).toEqual(['TYPED', 'FORM']);
      const form = await prisma.choiceOffer.findFirstOrThrow({
        where: { conversationId: id },
      });
      expect(form.state).toBe('CHOSEN');
    });
  } finally {
    await f.context.close();
  }
});

test('AC-40: two of three questions answered, a typed message sent instead: the form closes unanswered and the picks are not saved', async ({
  browser,
}, testInfo) => {
  testInfo.setTimeout(240_000);
  const f = await openSignedInFreelancer(browser, testInfo, 'ai-v2-form-typed-instead', {
    seed: { customerName: 'Acme Corp', timeZone: 'UTC' },
    context: { timezoneId: 'UTC', viewport: DESKTOP },
  });
  try {
    const { page, workspace } = f;
    const TYPED = 'Which invoices are overdue?';
    const id = await withDb(async (prisma) => {
      const gmbh = await createCustomer(prisma, workspace.userId, {
        name: 'Acme GmbH',
      });
      const [customerQ, priceQ] = defaultFormQuestions([
        workspace.customerId,
        gmbh.id,
      ]);
      const alpha = await createBankAccount(prisma, workspace.senderProfileId, {
        bankName: 'Alpha Bank',
        currency: 'USD',
        isDefault: false,
        accountNumber: '1111111111',
      });
      const beta = await createBankAccount(prisma, workspace.senderProfileId, {
        bankName: 'Beta Bank',
        currency: 'USD',
        isDefault: false,
        accountNumber: '2222222222',
      });
      const bank = accountAndPriceQuestions([alpha, beta])[0];
      return seedOpenForm(prisma, workspace.userId, [
        customerQ,
        { ...bank, questionId: 1 },
        { ...priceQ, questionId: 2 },
      ]);
    });

    await page.goto(`${APP_E2E_URL}/ai/${id}`);
    await expect(questionForm(page)).toBeVisible();
    await questionForm(page).getByRole('radio', { name: /Acme Corp/ }).click();
    await questionForm(page).getByRole('radio', { name: /Beta Bank/ }).click();
    await expect(questionForm(page).getByText('3 of 3')).toBeVisible();

    await message(page).fill(TYPED);
    await send(page).click();

    await expect(userBubbles(page).last()).toHaveText(TYPED);
    // The typed message closes the form: nothing of it is shown any more, and nothing was sent for it.
    await expect(page.locator('[data-slot="question-form"]')).toHaveCount(0);
    await expect(questionForm(page)).toHaveCount(0);
    await expect(allowanceText(page)).toHaveText('29 of 30 messages left today');
    await withDb(async (prisma) => {
      const row = await prisma.choiceOffer.findFirstOrThrow({
        where: { conversationId: id },
      });
      expect(row.state).toBe('CLOSED');
      expect(row.answers).toBeNull();
      const typed = await prisma.conversationMessage.findFirstOrThrow({
        where: { conversationId: id, role: 'USER' },
        orderBy: { position: 'desc' },
      });
      expect(typed.origin).toBe('TYPED');
    });
  } finally {
    await f.context.close();
  }
});

const MARKDOWN = (invoiceId: string) =>
  [
    'You have **3 overdue invoices**:',
    '',
    `- [INV-100](/invoices/${invoiceId}/edit) is *late*`,
    '- INV-101 is late',
    '- INV-102 is late',
    '',
    '| Invoice | Total |',
    '| --- | --- |',
    '| INV-100 | **$1,000.00** |',
    '| INV-101 | **$500.00** |',
    '',
    'More in [the help page](https://example.com/help).',
  ].join('\n');

async function seedMarkdownConversation(
  userId: string,
  invoiceId: string
): Promise<string> {
  return withDb(async (prisma) => {
    const c = await createConversation(prisma, {
      userId,
      title: 'Overdue invoices',
      messages: [
        { role: 'USER', text: 'Which invoices are overdue?' },
        {
          role: 'ASSISTANT',
          parts: [{ type: 'text', text: MARKDOWN(invoiceId) }],
        },
      ],
    });
    return c.id;
  });
}

test('AC-42: a saved reply shows its list, bold and table; an in-app link opens the invoice, an external link is inert', async ({
  browser,
}, testInfo) => {
  testInfo.setTimeout(240_000);
  const f = await openSignedInFreelancer(browser, testInfo, 'ai-v2-markdown', {
    seed: { timeZone: 'UTC' },
    context: { timezoneId: 'UTC', viewport: DESKTOP },
  });
  try {
    const { page, workspace } = f;
    const id = await seedMarkdownConversation(
      workspace.userId,
      workspace.invoiceId
    );
    await page.goto(`${APP_E2E_URL}/ai/${id}`);
    const reply = replies(page).last();
    await expect(reply).toBeVisible();

    await expect(reply.locator('ul > li')).toHaveCount(3);
    await expect(reply.locator('strong').first()).toHaveText('3 overdue invoices');
    await expect(reply.getByRole('table')).toBeVisible();
    await expect(reply.getByRole('columnheader')).toHaveText(['Invoice', 'Total']);
    await expect(reply.getByRole('cell').filter({ has: page.locator('strong') })).toHaveText([
      '$1,000.00',
      '$500.00',
    ]);
    // The marks are rendered, not shown as typed.
    await expect(reply).not.toContainText('**');
    await expect(reply).not.toContainText('| ---');

    // An external link is plain text: no anchor, and a click goes nowhere.
    await expect(reply.locator('a[href^="http"]')).toHaveCount(0);
    await expect(reply.getByRole('link', { name: 'the help page' })).toHaveCount(0);
    const before = page.url();
    await reply.getByText('the help page').click();
    expect(page.url()).toBe(before);

    // The in-app link opens the invoice in the editor, in the same tab.
    const link = reply.getByRole('link', { name: 'INV-100' });
    await expect(link).toHaveAttribute('href', `/invoices/${workspace.invoiceId}/edit`);
    await link.click();
    await expect(page).toHaveURL(
      new RegExp(`/invoices/${workspace.invoiceId}/edit$`)
    );
  } finally {
    await f.context.close();
  }
});

for (const viewport of [
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
]) {
  test(`AC-50: at ${viewport.width} x ${viewport.height} the list's top row and the chat header end on one line`, async ({
    browser,
  }, testInfo) => {
    testInfo.setTimeout(240_000);
    const f = await openSignedInFreelancer(
      browser,
      testInfo,
      `ai-v2-align-${viewport.width}`,
      {
        seed: { timeZone: 'UTC' },
        context: { timezoneId: 'UTC', viewport: DESKTOP },
      }
    );
    try {
      const { page, workspace } = f;
      await page.setViewportSize(viewport);
      const id = await withDb(async (prisma) => {
        const c = await createConversation(prisma, {
          userId: workspace.userId,
          title: 'Aligned',
          messages: textMessages(2, 'a'),
        });
        return c.id;
      });
      await page.goto(`${APP_E2E_URL}/ai/${id}`);
      const top = page.locator('[data-slot="conversation-list-top"]:visible');
      const header = page.locator('[data-slot="chat-header"]:visible');
      await expect(top).toBeVisible();
      await expect(header).toBeVisible();
      await expect(replies(page)).toHaveCount(1);
      const t = (await top.boundingBox())!;
      const h = (await header.boundingBox())!;
      expect(Math.abs(t.height - h.height)).toBeLessThanOrEqual(1);
      expect(Math.abs(t.y + t.height - (h.y + h.height))).toBeLessThanOrEqual(1);
      // The border is the row's own bottom edge, 1 px thick on both.
      const borders = await page.evaluate(() => {
        const px = (sel: string) =>
          getComputedStyle(
            Array.from(document.querySelectorAll(sel)).find(
              (el) => (el as HTMLElement).offsetParent !== null
            )!
          ).borderBottomWidth;
        return [
          px('[data-slot="conversation-list-top"]'),
          px('[data-slot="chat-header"]'),
        ];
      });
      expect(borders).toEqual(['1px', '1px']);
    } finally {
      await f.context.close();
    }
  });
}

test('AC-51: with a delayed server the chat pane placeholders have the size and place of the header, first message and composer that replace them, and the page shifts by at most 0.01', async ({
  browser,
}, testInfo) => {
  testInfo.setTimeout(240_000);
  const f = await openSignedInFreelancer(browser, testInfo, 'ai-v2-skeleton', {
    seed: { timeZone: 'UTC' },
    context: { timezoneId: 'UTC', viewport: DESKTOP },
  });
  try {
    const { page, workspace } = f;
    const [firstId, secondId] = await withDb(async (prisma) => {
      const a = await createConversation(prisma, {
        userId: workspace.userId,
        title: 'Skeleton first',
        messages: textMessages(2, 'a'),
      });
      const b = await createConversation(prisma, {
        userId: workspace.userId,
        title: 'Skeleton second',
        lastMessageAt: new Date(Date.now() - 3600_000),
        messages: textMessages(2, 'b'),
      });
      return [a.id, b.id];
    });

    let delayMs = 0;
    await page.route(
      (url) => url.pathname === `/ai/${secondId}`,
      async (route) => {
        if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
        await route.continue();
      }
    );
    await page.goto(`${APP_E2E_URL}/ai/${firstId}`);
    await expect(replies(page)).toHaveCount(1);
    await page.waitForLoadState('networkidle');

    await page.evaluate(() => {
      const w = window as unknown as { __shift?: number };
      w.__shift = 0;
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as unknown as Array<{
          value: number;
          hadRecentInput: boolean;
        }>)
          if (!e.hadRecentInput) w.__shift! += e.value;
      }).observe({ type: 'layout-shift', buffered: false });
    });

    const listTop = page.locator('[data-slot="conversation-list-top"]:visible');
    const listBefore = (await listTop.boundingBox())!;

    delayMs = 2500;
    await page.locator(`a[href="/ai/${secondId}"]:visible`).click();

    // The placeholders: the header row, the avatar and the composer.
    const skeletons = page.locator('[data-slot="skeleton"]');
    await expect(skeletons.first()).toBeVisible();
    await expect(page.locator('[data-slot="chat-header"]:visible')).toHaveCount(0);
    const box = async (l: ReturnType<Page['locator']>) => (await l.boundingBox())!;
    const placeholder = {
      header: await box(skeletons.first().locator('xpath=..')),
      avatar: await box(page.locator('[data-slot="skeleton"].rounded-full')),
      composer: await box(skeletons.last()),
    };
    // The list is not a placeholder and does not move while the pane loads.
    expect(await box(listTop)).toEqual(listBefore);

    await expect(replies(page)).toHaveCount(1, { timeout: 20_000 });
    await expect(userBubbles(page).first()).toContainText('b message 1');
    const real = {
      header: await box(page.locator('[data-slot="chat-header"]:visible')),
      avatar: await box(page.locator('[data-slot="message-avatar"]').first()),
      composer: await box(page.locator('[data-slot="composer"]')),
    };
    for (const part of ['header', 'avatar', 'composer'] as const) {
      for (const k of ['x', 'y', 'width', 'height'] as const) {
        expect.soft(
          Math.abs(placeholder[part][k] - real[part][k]),
          `${part}.${k}: placeholder ${placeholder[part][k]} vs content ${real[part][k]}`
        ).toBeLessThanOrEqual(1);
      }
    }
    expect(await box(listTop)).toEqual(listBefore);

    const shift = await page.evaluate(
      () => (window as unknown as { __shift: number }).__shift
    );
    expect(shift).toBeLessThanOrEqual(0.01);
  } finally {
    await f.context.close();
  }
});

test('AC-52: picking another Conversation changes only the chat pane: the list is not read again, stays the same node, keeps its scroll, search and rows', async ({
  browser,
}, testInfo) => {
  testInfo.setTimeout(240_000);
  const f = await openSignedInFreelancer(browser, testInfo, 'ai-v2-switch', {
    seed: { timeZone: 'UTC' },
    context: { timezoneId: 'UTC', viewport: { width: 1440, height: 900 } },
  });
  try {
    const { page, workspace } = f;
    const firstId = await withDb(async (prisma) => {
      let first = '';
      for (let i = 0; i < 40; i++) {
        const c = await createConversation(prisma, {
          userId: workspace.userId,
          title: `Invoice chat ${i + 1}`,
          lastMessageAt: new Date(Date.now() - i * 6 * 3600_000),
          messages: textMessages(2, `c${i}`),
        });
        if (i === 0) first = c.id;
      }
      return first;
    });

    await page.goto(`${APP_E2E_URL}/ai/${firstId}`);
    await expect(replies(page)).toHaveCount(1);
    const list = page.getByRole('complementary', { name: 'Conversation list' });
    await expect(list).toBeVisible();
    await page.waitForLoadState('networkidle');
    const viewport = list.locator('[data-slot="scroll-area-viewport"]');
    await viewport.evaluate((el) => {
      el.scrollTop = (el.scrollHeight - el.clientHeight) / 2;
    });
    const search = list.getByRole('textbox', { name: 'Search conversations' });
    await search.fill('inv');
    const scrollBefore = await viewport.evaluate((el) => el.scrollTop);
    expect(scrollBefore).toBeGreaterThan(100);
    const rowsBefore = await list.getByRole('link').count();
    expect(rowsBefore).toBeGreaterThanOrEqual(40);
    const listNode = await list.elementHandle();
    const searchNode = await search.elementHandle();

    // Pick a row that is in view, never the open one. The server is slow, so the loading state is observable.
    const pickedHref = await list.evaluate((aside) => {
      const vp = aside.querySelector('[data-slot="scroll-area-viewport"]')!;
      const area = vp.getBoundingClientRect();
      const link = Array.from(aside.querySelectorAll<HTMLAnchorElement>('a[href^="/ai/"]')).find(
        (a) => {
          const r = a.getBoundingClientRect();
          return (
            a.getAttribute('aria-current') !== 'page' &&
            r.top >= area.top + 4 &&
            r.bottom <= area.bottom - 4
          );
        }
      )!;
      return link.getAttribute('href')!;
    });
    const pickedId = pickedHref.replace('/ai/', '');
    const pickedLink = list.locator(`a[href="${pickedHref}"]`);
    const pickedTitle = (await pickedLink.innerText()).trim();

    let delayMs = 2500;
    await page.route(
      (url) => url.pathname === pickedHref,
      async (route) => {
        await new Promise((r) => setTimeout(r, delayMs));
        await route.continue();
      }
    );
    const seen: Array<{ url: string; rsc: boolean; body: Promise<string> }> = [];
    page.on('response', (response) => {
      const req = response.request();
      const headers = req.headers();
      seen.push({
        url: response.url(),
        // A server read for the page; the router's background prefetch of other rows is not a list read.
        rsc:
          (headers['rsc'] === '1' || response.url().includes('_rsc=')) &&
          !headers['next-router-prefetch'],
        body: response.text().catch(() => ''),
      });
    });

    await pickedLink.click();
    // Only the chat pane shows a loading state.
    await expect(page.locator('[data-slot="skeleton"]').first()).toBeVisible();
    await expect(listNode!.evaluate((el) => el.isConnected)).resolves.toBe(true);
    await expect(pickedLink).toHaveAttribute('aria-current', 'page');
    await expect(replies(page)).toHaveCount(1, { timeout: 20_000 });
    await expect(page).toHaveURL(new RegExp(`${pickedHref}$`));
    delayMs = 0;
    await page.waitForLoadState('networkidle');

    expect(await listNode!.evaluate((el) => el.isConnected)).toBe(true);
    expect(await searchNode!.evaluate((el) => el.isConnected)).toBe(true);
    await expect(search).toHaveValue('inv');
    expect(
      Math.abs((await viewport.evaluate((el) => el.scrollTop)) - scrollBefore)
    ).toBeLessThanOrEqual(1);
    expect(await list.getByRole('link').count()).toBe(rowsBefore);
    await expect(list.locator('a[aria-current="page"]')).toHaveCount(1);

    // The list is not read again: the only server reads are the picked page's own, and none of them carries the list.
    const reads = seen.filter((r) => r.rsc);
    for (const r of reads) {
      expect(new URL(r.url).pathname, 'only the chat pane is read').toBe(pickedHref);
      const titles = new Set(((await r.body).match(/Invoice chat \d+/g) ?? []));
      titles.delete(pickedTitle);
      expect(Array.from(titles), `${r.url} must not carry the Conversation list`).toEqual([]);
    }
    expect(seen.filter((r) => /\/api\/(ai\/)?conversations/.test(r.url))).toEqual([]);
    expect(pickedId.length).toBeGreaterThan(0);
  } finally {
    await f.context.close();
  }
});

test('AC-17 / AC-52 (T75): after the first send on /ai the new row is the current one and deleting it lands on /ai; a send in an existing Conversation reads no list', async ({
  browser,
}, testInfo) => {
  testInfo.setTimeout(240_000);
  const f = await openSignedInFreelancer(browser, testInfo, 'ai-v2-new-row', {
    seed: { timeZone: 'UTC' },
    context: { timezoneId: 'UTC', viewport: { width: 1440, height: 900 } },
  });
  try {
    const { page } = f;
    const list = page.getByRole('complementary', { name: 'Conversation list' });
    await page.goto(`${APP_E2E_URL}/ai`);
    await message(page).fill('Who owes me money right now?');
    await send(page).click();
    // The address is swapped in place (history.replaceState); the new row must follow it.
    await expect(page).toHaveURL(/\/ai\/[^/?]+$/);
    await expect(replies(page)).toHaveCount(1);
    const current = list.locator('a[aria-current="page"]');
    await expect(current).toHaveCount(1);
    await expect(current).toHaveAttribute('href', new URL(page.url()).pathname);

    // A second send in this (now existing) Conversation reads neither the list nor the layout again.
    const seen: Array<{ url: string; rsc: boolean }> = [];
    page.on('response', (response) => {
      const headers = response.request().headers();
      seen.push({
        url: response.url(),
        rsc:
          (headers['rsc'] === '1' || response.url().includes('_rsc=')) &&
          !headers['next-router-prefetch'],
      });
    });
    await message(page).fill('And who is late?');
    await send(page).click();
    await expect(replies(page)).toHaveCount(2);
    await page.waitForLoadState('networkidle');
    expect(seen.filter((r) => r.rsc)).toEqual([]);
    expect(seen.filter((r) => /\/api\/(ai\/)?conversations/.test(r.url))).toEqual([]);

    // Deleting the open (just-created) row from the list leaves for /ai.
    const title = (await current.innerText()).trim();
    await list.getByRole('button', { name: `Actions for ${title}` }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /^Delete/ })
      .click();
    await expect(page).toHaveURL(/\/ai$/);
    await expect(list.getByRole('link', { name: title })).toHaveCount(0);
    await expect(userBubbles(page)).toHaveCount(0);
  } finally {
    await f.context.close();
  }
});

test('AC-53: each avatar is level with the first line of its reply, for a one-line and a five-line reply', async ({
  browser,
}, testInfo) => {
  testInfo.setTimeout(240_000);
  const f = await openSignedInFreelancer(browser, testInfo, 'ai-v2-avatar', {
    seed: { timeZone: 'UTC' },
    context: { timezoneId: 'UTC', viewport: DESKTOP },
  });
  try {
    const { page, workspace } = f;
    const id = await withDb(async (prisma) => {
      const c = await createConversation(prisma, {
        userId: workspace.userId,
        title: 'Avatar',
        messages: [
          { role: 'USER', text: 'Short one?' },
          { role: 'ASSISTANT', text: 'One short line.' },
          { role: 'USER', text: 'And a long one?' },
          {
            role: 'ASSISTANT',
            text: [1, 2, 3, 4, 5].map((n) => `Line number ${n} of the answer.`).join('\n\n'),
          },
        ],
      });
      return c.id;
    });
    await page.goto(`${APP_E2E_URL}/ai/${id}`);
    await expect(replies(page)).toHaveCount(2);
    await expect(page.locator('[data-slot="message-avatar"]')).toHaveCount(2);

    // The Markdown renderer may still be swapping its text nodes right after the reply appears: poll until both
    // replies have a laid-out first line.
    const readMids = () =>
      page.evaluate(() => {
        const out: Array<{ avatar: number; line: number }> = [];
        for (const row of Array.from(document.querySelectorAll('[data-role="assistant"]'))) {
          const avatarEl = row.querySelector('[data-slot="message-avatar"]');
          const content = row.querySelector('[data-slot="message-content"]');
          if (!avatarEl || !content) continue;
          const avatar = avatarEl.getBoundingClientRect();
          const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
          let node: Node | null;
          while ((node = walker.nextNode()) && !node.textContent?.trim());
          if (!node) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          const line = range.getClientRects()[0];
          if (!line) continue;
          out.push({
            avatar: avatar.top + avatar.height / 2,
            line: line.top + line.height / 2,
          });
        }
        return out;
      });
    await expect.poll(async () => (await readMids()).length).toBe(2);
    const mids = await readMids();
    expect(mids).toHaveLength(2);
    for (const m of mids) expect(Math.abs(m.avatar - m.line)).toBeLessThanOrEqual(1);
  } finally {
    await f.context.close();
  }
});

test.describe('visual baselines: the Markdown reply and the three-question form in the aligned workspace', () => {
  test('SCR-03 Markdown reply and SCR-04 open form', async ({
    browser,
  }, testInfo) => {
    test.skip(
      SNAPSHOT_PLATFORM !== 'linux',
      'Baselines are Linux-only (CI image); see tests/e2e/README.md'
    );
    testInfo.setTimeout(240_000);
    const f = await openSignedInFreelancer(browser, testInfo, 'ai-v2-visual-forms', {
      seed: { customerName: 'Acme Corp', timeZone: 'UTC' },
      context: { timezoneId: 'UTC', viewport: DESKTOP },
    });
    try {
      const { page, workspace } = f;
      const markdownId = await seedMarkdownConversation(
        workspace.userId,
        workspace.invoiceId
      );
      const formId = await withDb(async (prisma) => {
        const gmbh = await createCustomer(prisma, workspace.userId, {
          name: 'Acme GmbH',
        });
        return seedOpenForm(
          prisma,
          workspace.userId,
          defaultFormQuestions([workspace.customerId, gmbh.id])
        );
      });
      const volatile = () => [
        page.getByText(/@example\.test/),
        page.getByText(/\b[A-Z][a-z]{2} \d{1,2}, \d{4}\b/),
        page.getByText(/^\d{1,2} [A-Z][a-z]{2} \d{4}$/),
        page.locator('[data-slot="greeting-line"]'),
        page.locator('[data-slot="conversation-list-top"] ~ * time'),
      ];
      const shot = { maxDiffPixelRatio: 0.002, animations: 'disabled' as const };

      await page.goto(`${APP_E2E_URL}/ai/${markdownId}`);
      await expect(replies(page)).toHaveCount(1);
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('ai-v2-markdown-reply.png', {
        ...shot,
        mask: volatile(),
      });

      await page.goto(`${APP_E2E_URL}/ai/${formId}`);
      await expect(questionForm(page)).toBeVisible();
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('ai-v2-form-open-aligned.png', {
        ...shot,
        mask: volatile(),
      });
    } finally {
      await f.context.close();
    }
  });
});
