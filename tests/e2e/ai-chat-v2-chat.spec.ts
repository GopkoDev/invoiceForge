// ai-chat-v2 T30 (test-plan.md §Levels "E2E-through-UI"; ux-flows US-03..US-06, US-11): the real UI against the
// production build and its throwaway database, answering from the scripted stub model (lib/ai/e2e-stub-model.ts).
// AC-08 press -> card; AC-13 reopen with the chosen mark and a refused open button; AC-15 only the panes scroll at
// four sizes; AC-18 empty state -> first reply, listed; AC-19 the phone list sheet; AC-33 the reply streams in and
// reopens whole. Plus the SCR-02 and SCR-03/SCR-04 visual baselines (Linux-only, see tests/e2e/README.md).
import { test, expect, type Page } from '@playwright/test';
import type { PrismaClient } from '@prisma/client';
import { createTestPrismaClient } from '../support/db/client';
import { createBankAccount } from '../support/factories/bank-account';
import { createCustomer } from '../support/factories/customer';
import {
  createConversation,
  type ConversationMessageInput,
} from '../support/factories/conversation';
import { createChoiceOffer } from '../support/factories/choice-offer';
import {
  APP_E2E_URL,
  SNAPSHOT_PLATFORM,
  readE2eRuntime,
} from './support/app-server';
import { openSignedInFreelancer } from './support/signed-in';
import { protectedRoutes } from '../../config/routes.config';
import { STREAMED_REPLY } from '../../lib/ai/e2e-stub-model';

test.describe.configure({ timeout: 150_000 });

const AMBIGUOUS = 'invoice Acme for 20 hours at $50';
const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 360, height: 640 };
const UNAVAILABLE =
  'This option is no longer available. Choose again or type your request.';

const message = (page: Page) => page.getByRole('textbox', { name: 'Message' });
const send = (page: Page) =>
  page.getByRole('button', { name: 'Send', exact: true });
const userBubbles = (page: Page) => page.locator('[data-role="user"]');
const replies = (page: Page) => page.locator('[data-role="assistant"]');
const allowanceText = (page: Page) =>
  page.getByText(/\d+ of 30 messages left today/).first();

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

test('AC-08: pressing "Acme GmbH" sends that choice and the chat continues with a card for Acme GmbH', async ({
  browser,
}, testInfo) => {
  testInfo.setTimeout(240_000);
  const f = await openSignedInFreelancer(browser, testInfo, 'ai-v2-press', {
    seed: { customerName: 'Acme Corp', timeZone: 'UTC' },
    context: { timezoneId: 'UTC', viewport: DESKTOP },
  });
  try {
    const { page, workspace } = f;
    await withDb((prisma) =>
      createCustomer(prisma, workspace.userId, { name: 'Acme GmbH' })
    );

    await page.goto(`${APP_E2E_URL}${protectedRoutes.ai}`);
    await message(page).fill(AMBIGUOUS);
    await send(page).click();

    const choices = page.getByRole('group', { name: 'Choose a Customer' });
    await expect(choices).toBeVisible();
    await expect(choices.getByRole('button')).toHaveText([
      'Acme Corp',
      'Acme GmbH',
    ]);
    await expect(
      page.getByRole('button', { name: 'Create draft' })
    ).toHaveCount(0);

    await choices
      .getByRole('button', { name: 'Acme GmbH', exact: true })
      .click();

    await expect(userBubbles(page).last()).toHaveText('Acme GmbH');
    await expect(
      page.getByRole('button', { name: 'Create draft' })
    ).toBeVisible();
    await expect(
      choices.getByRole('button', { name: 'Acme GmbH (chosen)' })
    ).toBeVisible();
    await expect(
      choices.getByRole('button', { name: 'Acme Corp', exact: true })
    ).toBeDisabled();

    // The press was saved as a PRESSED message with the stored label, and the card is for exactly Acme GmbH.
    await withDb(async (prisma) => {
      const pressed = await prisma.conversationMessage.findFirstOrThrow({
        where: { conversation: { userId: workspace.userId }, role: 'USER' },
        orderBy: { position: 'desc' },
      });
      expect(pressed.origin).toBe('PRESSED');
      const gmbh = await prisma.customer.findFirstOrThrow({
        where: { userId: workspace.userId, name: 'Acme GmbH' },
      });
      const card = await prisma.draftCard.findFirstOrThrow({
        where: { userId: workspace.userId },
      });
      expect(
        (card.proposal as { customer: { customerId: string } }).customer
          .customerId
      ).toBe(gmbh.id);
    });
  } finally {
    await f.context.close();
  }
});

test('AC-13: a reopened Conversation shows the three offered accounts with the pressed one marked; an open button for a deleted account is refused without counting', async ({
  browser,
}, testInfo) => {
  testInfo.setTimeout(240_000);
  const f = await openSignedInFreelancer(
    browser,
    testInfo,
    'ai-v2-reopen-offer',
    {
      seed: { customerName: 'Acme Corp', timeZone: 'UTC' },
      context: { timezoneId: 'UTC', viewport: DESKTOP },
    }
  );
  try {
    const { page, workspace } = f;
    const conversationId = await withDb(async (prisma) => {
      const [alpha, beta, gamma] = await Promise.all(
        ['Alpha Bank', 'Beta Bank', 'Gamma Bank'].map((bankName, i) =>
          createBankAccount(prisma, workspace.senderProfileId, {
            bankName,
            currency: 'USD',
            isDefault: false,
            accountNumber: `${i + 1}`.repeat(10),
          })
        )
      );
      const accounts = [alpha, beta, gamma];
      const reply1 = `e2e-offer-reply-1-${workspace.userId}`;
      const reply2 = `e2e-offer-reply-2-${workspace.userId}`;
      const label = (a: (typeof accounts)[number]) =>
        `${a.bankName} ••${a.accountNumber.slice(-4)} · USD`;
      const options = accounts.map((a, i) => ({
        optionId: i + 1,
        label: label(a),
        ref: { bankAccountId: a.id },
      }));
      const conversation = await createConversation(prisma, {
        userId: workspace.userId,
        title: 'Acme accounts',
        lastMessageAt: new Date(Date.now() - 3 * 24 * 3600_000),
        messages: [
          { role: 'USER', text: AMBIGUOUS },
          {
            role: 'ASSISTANT',
            id: reply1,
            parts: [
              { type: 'text', text: 'Which account should be paid into?' },
            ],
          },
          { role: 'USER', text: label(beta), origin: 'PRESSED' },
          {
            role: 'ASSISTANT',
            id: reply2,
            parts: [
              { type: 'text', text: 'Which account for the second invoice?' },
            ],
          },
        ],
      });
      const chosen = await createChoiceOffer(prisma, {
        userId: workspace.userId,
        conversationId: conversation.id,
        messageId: reply1,
        kind: 'BANK_ACCOUNT',
        request: {
          customer: 'Acme',
          currency: 'USD',
          lines: [{ description: 'Design work', quantity: '20', price: '50' }],
        },
        options,
        state: 'CHOSEN',
        chosenOptionId: 2,
      });
      const open = await createChoiceOffer(prisma, {
        userId: workspace.userId,
        conversationId: conversation.id,
        messageId: reply2,
        kind: 'BANK_ACCOUNT',
        request: {
          customer: 'Acme',
          currency: 'USD',
          lines: [{ description: 'Design work', quantity: '20', price: '50' }],
        },
        options,
      });
      for (const [messageId, offer, text] of [
        [reply1, chosen, 'Which account should be paid into?'],
        [reply2, open, 'Which account for the second invoice?'],
      ] as const) {
        await prisma.conversationMessage.update({
          where: { id: messageId },
          data: {
            parts: [
              { type: 'text', text },
              { type: 'data-offer', id: offer.id, data: { offerId: offer.id } },
            ],
          },
        });
      }
      // The account offered on the still-open buttons is deleted afterwards.
      await prisma.bankAccount.delete({ where: { id: gamma.id } });
      return conversation.id;
    });

    await page.goto(`${APP_E2E_URL}${protectedRoutes.ai}`);
    await page.locator(`a[href="/ai/${conversationId}"]:visible`).click();
    await expect(page).toHaveURL(new RegExp(`/ai/${conversationId}$`));

    const groups = page.getByRole('group', { name: 'Choose a bank account' });
    await expect(groups).toHaveCount(2);
    const earlier = groups.first();
    await expect(earlier.getByRole('button')).toHaveCount(3);
    await expect(
      earlier.getByRole('button', { name: 'Beta Bank ••2222 · USD (chosen)' })
    ).toBeVisible();
    for (const button of await earlier.getByRole('button').all())
      await expect(button).toBeDisabled();

    // The latest reply's buttons can still be pressed; the deleted account's is turned down without counting.
    const latest = groups.last();
    await expect(
      latest.getByRole('button', { name: 'Gamma Bank ••3333 · USD' })
    ).toBeEnabled();
    const before = await allowanceText(page).textContent();
    await latest
      .getByRole('button', { name: 'Gamma Bank ••3333 · USD' })
      .click();
    await expect(page.getByText(UNAVAILABLE)).toBeVisible();
    await expect(
      latest.getByRole('button', { name: /\(chosen\)/ })
    ).toHaveCount(0);
    await expect(allowanceText(page)).toHaveText(before!);
    await withDb(async (prisma) => {
      expect(
        await prisma.messageAllowanceDay.count({
          where: { userId: workspace.userId, used: { gt: 0 } },
        })
      ).toBe(0);
      expect(
        await prisma.conversationMessage.count({ where: { conversationId } })
      ).toBe(4);
    });
  } finally {
    await f.context.close();
  }
});

for (const viewport of [
  { width: 360, height: 640 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
  { width: 2560, height: 1440 }, // the spec §6 upper bound (review 2026-10-13 R1-U6)
]) {
  test(`AC-15: at ${viewport.width} x ${viewport.height} with 40 Conversations and 60 messages only the panes scroll`, async ({
    browser,
  }, testInfo) => {
    testInfo.setTimeout(240_000);
    const f = await openSignedInFreelancer(
      browser,
      testInfo,
      `ai-v2-layout-${viewport.width}`,
      {
        seed: { timeZone: 'UTC' },
        context: { timezoneId: 'UTC', viewport: DESKTOP },
      }
    );
    try {
      const { page, workspace } = f;
      // Signed in at desktop size (the cookie banner covers the phone sign-in button), then resized.
      await page.setViewportSize(viewport);
      const longId = await withDb(async (prisma) => {
        for (let i = 0; i < 39; i++) {
          await createConversation(prisma, {
            userId: workspace.userId,
            title: `Older conversation ${i + 1}`,
            lastMessageAt: new Date(Date.now() - (i + 1) * 6 * 3600_000),
            messages: textMessages(2, `c${i}`),
          });
        }
        const long = await createConversation(prisma, {
          userId: workspace.userId,
          title: 'Sixty messages',
          messages: textMessages(60, 'long'),
        });
        return long.id;
      });

      await page.goto(`${APP_E2E_URL}/ai/${longId}`);
      await expect(replies(page)).toHaveCount(30);
      await expect(message(page)).toBeInViewport();
      // The cookie banner (shown until accepted) never covers the docked box or its Send button.
      await expect(page.getByRole('button', { name: 'Accept' })).toBeVisible();
      await message(page).fill('Who owes me money right now?');
      await expect(send(page)).toBeEnabled();
      for (const target of [message(page), send(page)]) {
        const covered = await target.evaluate((el) => {
          const r = el.getBoundingClientRect();
          const hit = document.elementFromPoint(
            r.x + r.width / 2,
            r.y + r.height / 2
          );
          return !(hit && (hit === el || el.contains(hit)));
        });
        expect(covered).toBe(false);
      }

      const pageScroll = () =>
        page.evaluate(() => ({
          scrollHeight: document.scrollingElement!.scrollHeight,
          innerHeight: window.innerHeight,
          scrollY: window.scrollY,
        }));
      const first = await pageScroll();
      expect(first.scrollHeight).toBeLessThanOrEqual(first.innerHeight);

      const chat = page.locator('[data-slot="chat-scroll"]');
      const chatSize = await chat.evaluate((el) => ({
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
      }));
      expect(chatSize.scrollHeight).toBeGreaterThan(chatSize.clientHeight);

      const list = page.getByRole('complementary', {
        name: 'Conversation list',
      });
      const listVisible = await list.isVisible();
      const listBefore = listVisible ? await list.boundingBox() : null;

      // Scroll the messages to the top: only that pane moves; the page and the list stay put; the box stays in view.
      await chat.evaluate((el) => el.scrollTo({ top: 0 }));
      await expect.poll(() => chat.evaluate((el) => el.scrollTop)).toBe(0);
      await chat.hover();
      await page.mouse.wheel(0, -2000);
      const after = await pageScroll();
      expect(after.scrollY).toBe(0);
      expect(after.scrollHeight).toBeLessThanOrEqual(after.innerHeight);
      await expect(message(page)).toBeInViewport();
      if (listVisible) expect(await list.boundingBox()).toEqual(listBefore);

      // The list pane scrolls on its own too (desktop): the page still does not.
      if (listVisible) {
        await list.hover();
        await page.mouse.wheel(0, 3000);
        await expect(list.getByText('Older conversation 39')).toBeInViewport();
        expect((await pageScroll()).scrollY).toBe(0);
        await expect(message(page)).toBeInViewport();
      }
    } finally {
      await f.context.close();
    }
  });
}

test('AC-18: a new Conversation starts with a greeting and suggestions, is not saved until the first message, then moves the box down and is listed', async ({
  browser,
}, testInfo) => {
  testInfo.setTimeout(240_000);
  const f = await openSignedInFreelancer(
    browser,
    testInfo,
    'ai-v2-empty-start',
    {
      seed: { timeZone: 'UTC' },
      context: { timezoneId: 'UTC', viewport: DESKTOP },
    }
  );
  try {
    const { page, workspace } = f;
    const QUESTION = 'Who owes me money right now?';
    await page.goto(`${APP_E2E_URL}${protectedRoutes.ai}`);
    await expect(
      page.getByRole('heading', {
        name: /How can I help with your invoices today\?/,
      })
    ).toBeVisible();
    const start = page.locator('[data-slot="start-panel"]');
    await expect(start.locator('[data-slot="start-composer"]')).toBeVisible();
    await expect(start.getByRole('button', { name: QUESTION })).toBeVisible();
    await expect(
      start.getByRole('button', {
        name: 'Invoice Acme for 20 hours of consulting at $50',
      })
    ).toBeVisible();

    // A suggestion only fills the box: nothing is sent or saved.
    await start.getByRole('button', { name: QUESTION }).click();
    await expect(message(page)).toHaveValue(QUESTION);
    await expect(userBubbles(page)).toHaveCount(0);
    await page.reload();
    await expect(
      page.getByRole('heading', {
        name: /How can I help with your invoices today\?/,
      })
    ).toBeVisible();
    expect(
      await withDb((prisma) =>
        prisma.conversation.count({ where: { userId: workspace.userId } })
      )
    ).toBe(0);

    await message(page).fill(QUESTION);
    await send(page).click();
    await expect(page).toHaveURL(/\/ai\/[^/?]+$/);
    await expect(userBubbles(page)).toHaveText([QUESTION]);
    await expect(replies(page)).toHaveCount(1);
    await expect(start).toHaveCount(0);
    // The box is docked at the bottom, below the reply.
    const dock = page.locator('[data-slot="composer-dock"]');
    await expect(dock.getByRole('textbox', { name: 'Message' })).toBeVisible();
    // The move is a ~250 ms translate (FLIP); measure where it ends, not mid-move.
    await expect
      .poll(() => dock.evaluate((el) => getComputedStyle(el).transform))
      .toBe('none');
    const replyBox = await replies(page).first().boundingBox();
    const dockBox = await dock.boundingBox();
    expect(replyBox!.y + replyBox!.height).toBeLessThanOrEqual(dockBox!.y);
    expect(dockBox!.y + dockBox!.height).toBeGreaterThan(DESKTOP.height - 120);

    const id = page.url().split('/ai/')[1];
    await expect(page.locator(`a[href="/ai/${id}"]:visible`)).toHaveCount(1);
    expect(
      await withDb((prisma) =>
        prisma.conversation.count({ where: { userId: workspace.userId } })
      )
    ).toBe(1);
  } finally {
    await f.context.close();
  }
});

test('AC-19: on a phone the chat fills the screen and the Conversation list opens as a sheet that closes on a pick', async ({
  browser,
}, testInfo) => {
  testInfo.setTimeout(240_000);
  const f = await openSignedInFreelancer(browser, testInfo, 'ai-v2-phone', {
    seed: { timeZone: 'UTC' },
    context: { timezoneId: 'UTC', viewport: DESKTOP },
  });
  try {
    const { page, workspace } = f;
    // Signed in at desktop size (the cookie banner covers the phone sign-in button), then resized.
    await page.setViewportSize(PHONE);
    const [firstId, secondId] = await withDb(async (prisma) => {
      const a = await createConversation(prisma, {
        userId: workspace.userId,
        title: 'Phone first',
        messages: textMessages(2, 'a'),
      });
      const b = await createConversation(prisma, {
        userId: workspace.userId,
        title: 'Phone second',
        lastMessageAt: new Date(Date.now() - 3600_000),
        messages: textMessages(2, 'b'),
      });
      return [a.id, b.id];
    });

    await page.goto(`${APP_E2E_URL}/ai/${firstId}`);
    await expect(replies(page)).toHaveCount(1);
    await expect(
      page.getByRole('complementary', { name: 'Conversation list' })
    ).toBeHidden();
    await expect(message(page)).toBeInViewport();
    // The box sits at the bottom: just above the cookie banner while it shows, never under it.
    const box = await message(page).boundingBox();
    const banner = await page
      .getByRole('button', { name: 'Accept' })
      .evaluate((el) => el.closest('.fixed')!.getBoundingClientRect().top);
    expect(box!.y + box!.height).toBeLessThanOrEqual(banner);
    expect(box!.y + box!.height).toBeGreaterThan(banner - 160);

    await page.getByRole('button', { name: 'Open conversations' }).click();
    const sheet = page.getByRole('dialog', { name: 'Conversations' });
    await expect(sheet).toBeVisible();
    await sheet.locator(`a[href="/ai/${secondId}"]`).click();
    await expect(page).toHaveURL(new RegExp(`/ai/${secondId}$`));
    await expect(sheet).toBeHidden();
    await expect(userBubbles(page).first()).toContainText('b message 1');
  } finally {
    await f.context.close();
  }
});

test('AC-33: a multi-sentence reply appears word by word, and reopens whole', async ({
  browser,
}, testInfo) => {
  testInfo.setTimeout(240_000);
  const f = await openSignedInFreelancer(browser, testInfo, 'ai-v2-stream', {
    seed: { timeZone: 'UTC' },
    context: { timezoneId: 'UTC', viewport: DESKTOP },
  });
  try {
    const { page } = f;
    const full = STREAMED_REPLY.join('').trim();
    await page.goto(`${APP_E2E_URL}${protectedRoutes.ai}`);
    await message(page).fill('How do payment reminders work?');
    await send(page).click();

    // Sample the reply while it streams: it grows through several partial texts before the whole one.
    const reply = replies(page).last();
    const samples: string[] = await page.evaluate(async (expected) => {
      const seen: string[] = [];
      const deadline = Date.now() + 20_000;
      while (Date.now() < deadline) {
        const bubbles = document.querySelectorAll('[data-role="assistant"]');
        const text = (bubbles[bubbles.length - 1]?.textContent ?? '')
          .replace(/\s+/g, ' ')
          .trim();
        if (text && seen[seen.length - 1] !== text) seen.push(text);
        if (text === expected) break;
        await new Promise((r) => setTimeout(r, 30));
      }
      return seen;
    }, full);
    expect(samples[samples.length - 1]).toBe(full);
    const partial = samples.slice(0, -1).filter((s) => s.length < full.length);
    expect(partial.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < samples.length; i++)
      expect(samples[i].length).toBeGreaterThan(samples[i - 1].length);
    await expect(reply).toHaveText(full);

    // Reopened later: the saved reply is shown whole at once.
    await expect(page).toHaveURL(/\/ai\/[^/?]+$/);
    await page.reload();
    await page.waitForSelector('[data-role="assistant"]');
    const firstSeen = await page.evaluate(() =>
      (document.querySelector('[data-role="assistant"]')?.textContent ?? '')
        .replace(/\s+/g, ' ')
        .trim()
    );
    expect(firstSeen).toBe(full);
  } finally {
    await f.context.close();
  }
});

test.describe('visual baselines: SCR-02 empty state, SCR-03 with SCR-04 pressable and chosen', () => {
  test('SCR-02 and SCR-03/SCR-04', async ({ browser }, testInfo) => {
    test.skip(
      SNAPSHOT_PLATFORM !== 'linux',
      'Baselines are Linux-only (CI image); see tests/e2e/README.md'
    );
    testInfo.setTimeout(240_000);
    const f = await openSignedInFreelancer(browser, testInfo, 'ai-v2-visual', {
      seed: { customerName: 'Acme Corp', timeZone: 'UTC' },
      context: { timezoneId: 'UTC', viewport: DESKTOP },
    });
    try {
      const { page, workspace } = f;
      await withDb((prisma) =>
        createCustomer(prisma, workspace.userId, { name: 'Acme GmbH' })
      );
      const volatile = () => [
        page.getByText(/@example\.test/),
        page.getByText(/\b[A-Z][a-z]{2} \d{1,2}, \d{4}\b/),
        page.getByText(/^\d{1,2} [A-Z][a-z]{2} \d{4}$/),
        // ai-chat-v2 T37: greeting line 1 follows the time of day ("Good morning/afternoon/evening, {name}").
        page.locator('[data-slot="start-panel"] h1 > span').first(),
      ];
      const shot = {
        maxDiffPixelRatio: 0.002,
        animations: 'disabled' as const,
      };

      await page.goto(`${APP_E2E_URL}${protectedRoutes.ai}`);
      await expect(
        page.getByRole('heading', {
          name: /How can I help with your invoices today\?/,
        })
      ).toBeVisible();
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('ai-v2-new-conversation.png', {
        ...shot,
        mask: volatile(),
      });

      await message(page).fill(AMBIGUOUS);
      await send(page).click();
      const choices = page.getByRole('group', { name: 'Choose a Customer' });
      await expect(
        choices.getByRole('button', { name: 'Acme GmbH', exact: true })
      ).toBeEnabled();
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot(
        'ai-v2-offered-choices-pressable.png',
        { ...shot, mask: volatile() }
      );

      await choices
        .getByRole('button', { name: 'Acme GmbH', exact: true })
        .click();
      await expect(
        choices.getByRole('button', { name: 'Acme GmbH (chosen)' })
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Create draft' })
      ).toBeVisible();
      await page.waitForLoadState('networkidle');
      await page
        .locator('[data-slot="chat-scroll"]')
        .evaluate((el) => el.scrollTo({ top: 0 }));
      await expect(page).toHaveScreenshot('ai-v2-offered-choices-chosen.png', {
        ...shot,
        mask: volatile(),
      });
    } finally {
      await f.context.close();
    }
  });
});

// ai-chat-v2 T41 (ADR-0010; screens.md «Centred column», SCR-01 "row actions", «Errors are messages»): the new
// presentation keeps the behaviour; these pin its layout and the error-as-message retry in the real app.
test('presentation: a centred column of at most 768 px at 1440 x 900, no row delete without hover, and could-not-complete as an assistant message whose Try again re-sends once', async ({
  browser,
}, testInfo) => {
  testInfo.setTimeout(240_000);
  const WIDE = { width: 1440, height: 900 };
  const f = await openSignedInFreelancer(
    browser,
    testInfo,
    'ai-v2-presentation',
    {
      seed: { timeZone: 'UTC' },
      context: { timezoneId: 'UTC', viewport: WIDE },
    }
  );
  try {
    const { page, workspace } = f;
    const [openId] = await withDb(async (prisma) => {
      const open = await createConversation(prisma, {
        userId: workspace.userId,
        title: 'Open one',
        messages: textMessages(4, 'open'),
      });
      await createConversation(prisma, {
        userId: workspace.userId,
        title: 'Other one',
        lastMessageAt: new Date(Date.now() - 3600_000),
        messages: textMessages(2, 'other'),
      });
      return [open.id];
    });

    await page.goto(`${APP_E2E_URL}/ai/${openId}`);
    await expect(replies(page)).toHaveCount(2);

    // Centred column: the scroll area spans the pane, the messages and the docked box sit in a column <= 768 px,
    // centred in the pane; the user bubble is at most 80 % of it.
    const scroll = page.locator('[data-slot="chat-scroll"]');
    await expect(scroll).toBeVisible();
    await expect(userBubbles(page).first()).toBeVisible();
    const scrollBox = (await scroll.boundingBox())!;
    const columnBox = (await scroll
      .locator(':scope > div')
      .first()
      .boundingBox())!;
    expect(scrollBox.width).toBeGreaterThan(768);
    expect(columnBox.width).toBeLessThanOrEqual(768);
    expect(
      Math.abs(
        columnBox.x -
          scrollBox.x -
          (scrollBox.x + scrollBox.width - (columnBox.x + columnBox.width))
      )
    ).toBeLessThanOrEqual(16);
    const composerBox = (await page
      .locator('[data-slot="composer"]')
      .boundingBox())!;
    expect(composerBox.width).toBeLessThanOrEqual(768);
    const bubble = (await userBubbles(page)
      .first()
      .locator('[data-slot="message-content"]')
      .boundingBox())!;
    expect(bubble.width).toBeLessThanOrEqual(columnBox.width * 0.8 + 1);

    // No delete button is visible in the list; a non-current row's ⋯ shows only on hover.
    const list = page.getByRole('complementary', { name: 'Conversation list' });
    await expect(list.getByRole('button', { name: /delete/i })).toHaveCount(0);
    const otherActions = list.getByRole('button', {
      name: 'Actions for Other one',
    });
    const opacity = () =>
      otherActions.evaluate((el) => getComputedStyle(el).opacity);
    await page.mouse.move(WIDE.width - 10, WIDE.height / 2);
    await expect.poll(opacity).toBe('0');
    await list.getByRole('link', { name: 'Other one' }).hover();
    await expect.poll(opacity).toBe('1');
    await expect(
      list.getByRole('button', { name: 'Actions for Open one' })
    ).toHaveCSS('opacity', '1');

    // Could-not-complete: the alert and Try again live in an assistant message; Try again sends the same text once.
    const sent: string[] = [];
    let failOnce = true;
    await page.route('**/api/chat', async (route) => {
      sent.push(
        (
          route.request().postDataJSON() as {
            message: { parts: { text: string }[] };
          }
        ).message.parts[0].text
      );
      if (failOnce) {
        failOnce = false;
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            code: 'FAILED',
            error: "The reply couldn't be completed. Try again.",
          }),
        });
        return;
      }
      await route.continue();
    });
    await message(page).fill('Who owes me money right now?');
    await send(page).click();
    const failed = replies(page).last();
    await expect(failed.getByRole('alert')).toHaveText(
      "The reply couldn't be completed. Try again."
    );
    await failed.getByRole('button', { name: 'Try again' }).click();
    await expect(scroll.getByRole('alert')).toHaveCount(0);
    await expect(replies(page)).toHaveCount(3);
    await expect(userBubbles(page).last()).toHaveText(
      'Who owes me money right now?'
    );
    expect(sent).toEqual([
      'Who owes me money right now?',
      'Who owes me money right now?',
    ]);
  } finally {
    await f.context.close();
  }
});
