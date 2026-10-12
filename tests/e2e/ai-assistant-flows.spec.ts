// T41 (R-25; test-plan.md e2e-through-UI rows): AC-25 a Personal key with Draft permission,
// AC-34 Create with AI with the allowance used up, AC-35 reopen a past Conversation and continue it,
// plus the SCR-01 / SCR-03 visual baselines. The production build answers from the scripted stub
// model (tests/e2e/support/ai-stub.ts); no real provider is called.
//
// Visual baselines (toHaveScreenshot) are Linux-only and authoritative; see tests/e2e/README.md
// ("Layout baselines"). macOS runs skip the screenshot comparison unless PW_SNAPSHOT_PLATFORM=linux.
import { test, expect, type Page } from '@playwright/test';
import { createTestPrismaClient } from '../support/db/client';
import {
  APP_E2E_URL,
  SNAPSHOT_PLATFORM,
  readE2eRuntime,
} from './support/app-server';
import { openSignedInFreelancer, readSavedTimeZone } from './support/signed-in';
import { protectedRoutes } from '../../config/routes.config';
import { dayToUtcDate, todayInZone } from '../../lib/helpers/calendar-day';

test.describe.configure({ timeout: 150_000 });

const DRAFT_SENTENCE = 'Invoice Acme for 20 hours of consulting at $50';
const DESKTOP = { width: 1280, height: 800 };
const message = (page: Page) => page.getByRole('textbox', { name: 'Message' });
const send = (page: Page) => page.getByRole('button', { name: 'Send', exact: true });

test('AC-25: a key created with Draft permission is shown once and listed as able to create drafts', async ({
  browser,
}, testInfo) => {
  testInfo.setTimeout(240_000);
  const f = await openSignedInFreelancer(browser, testInfo, 'ai-key-draft', {
    context: { timezoneId: 'UTC' },
  });
  try {
    const { page } = f;
    await page.goto(`${APP_E2E_URL}${protectedRoutes.settingsAssistants}`);
    await page.getByLabel('Key name').fill('Drafting assistant');
    await page
      .getByRole('checkbox', { name: 'Allow this key to create draft invoices' })
      .click();
    await page.getByRole('button', { name: 'Create key' }).click();

    const shown = page.getByLabel('New key');
    await expect(shown).toBeVisible();
    const fullKey = await shown.inputValue();
    expect(fullKey).toMatch(/^ifk_/);

    // After a reload the secret is gone and the list still marks the key as a drafter.
    await page.reload();
    await expect(page.getByLabel('New key')).toHaveCount(0);
    const row = page
      .locator('[data-slot="item"]')
      .filter({ hasText: 'Drafting assistant' });
    await expect(row).toHaveCount(1);
    await expect(row.getByText('Can create drafts')).toBeVisible();
    await expect(row.getByText('Read-only')).toHaveCount(0);
  } finally {
    await f.context.close();
  }
});

test('AC-34: with no messages left, Create with AI shows the used-up notice and no composer', async ({
  browser,
}, testInfo) => {
  testInfo.setTimeout(240_000);
  const f = await openSignedInFreelancer(browser, testInfo, 'ai-used-up', {
    seed: { timeZone: 'UTC' },
    context: { timezoneId: 'UTC' },
  });
  try {
    const { page, workspace } = f;
    // The allowance day is the Freelancer's own local day (allowance.ts: todayInZone(user zone)).
    // Use the saved zone, and the later of "now" and "now + 10 min" so a local midnight passing
    // between this seed and the page load cannot turn the row into yesterday's.
    const zone = (await readSavedTimeZone(workspace.userId)) ?? 'UTC';
    const now = new Date();
    const later = new Date(now.getTime() + 10 * 60_000);
    const day = [todayInZone(zone, now), todayInZone(zone, later)].sort().pop()!;
    const prisma = createTestPrismaClient(readE2eRuntime().databaseUrl);
    try {
      await prisma.messageAllowanceDay.create({
        data: {
          userId: workspace.userId,
          day: dayToUtcDate(day),
          used: 30,
          timeZone: zone,
          firstMessageAt: new Date(),
        },
      });
    } finally {
      await prisma.$disconnect();
    }

    await page.goto(`${APP_E2E_URL}${protectedRoutes.invoices}`);
    await page.getByRole('link', { name: 'Create with AI' }).click();
    await expect(page).toHaveURL(/\/ai\?start=draft$/);

    const main = page.getByRole('main');
    await expect(main.getByText("You've used today's 30 messages")).toBeVisible();
    await expect(main.getByText(/They renew .+ your time\./)).toBeVisible();
    await expect(
      main.getByRole('link', { name: 'Create it by hand →' })
    ).toHaveAttribute('href', protectedRoutes.invoicesNew);
    await expect(message(page)).toHaveCount(0);
    await expect(send(page)).toHaveCount(0);
    await expect(main.getByText(/messages left today/)).toHaveCount(0);
  } finally {
    await f.context.close();
  }
});

test('AC-35: a past Conversation reopens from the list and continues in the same Conversation', async ({
  browser,
}, testInfo) => {
  testInfo.setTimeout(240_000);
  const f = await openSignedInFreelancer(browser, testInfo, 'ai-reopen', {
    context: { timezoneId: 'UTC', viewport: DESKTOP },
  });
  try {
    const { page } = f;
    const FIRST = 'Who owes me money right now?';
    const SECOND = 'What is overdue today?';
    const REPLY = 'Here is a short answer from the stub model.';
    // Bubbles only: the chat also keeps a screen-reader live region with the latest answer.
    const replies = page.locator('[data-role="assistant"]').filter({ hasText: REPLY });
    const sent = page.locator('[data-role="user"]');

    await page.goto(`${APP_E2E_URL}${protectedRoutes.ai}`);
    await message(page).fill(FIRST);
    await send(page).click();
    await expect(page).toHaveURL(/\/ai\/[^/?]+$/);
    const conversationUrl = page.url();
    await expect(replies).toHaveCount(1);
    await expect(page.getByText('29 of 30 messages left today')).toBeVisible();

    // Leave, then reopen from the Conversations list.
    await page.goto(`${APP_E2E_URL}${protectedRoutes.ai}`);
    const id = conversationUrl.split('/ai/')[1];
    // T44: the list renders in two slots; only the one shown at this breakpoint counts.
    const rows = page.locator(`a[href="/ai/${id}"]:visible`);
    await expect(rows).toHaveCount(1);
    await rows.click();
    await expect(page).toHaveURL(conversationUrl);
    await expect(sent.filter({ hasText: FIRST })).toHaveCount(1);
    await expect(replies).toHaveCount(1);

    // Continue: the new message is answered and counted, in the same Conversation.
    await message(page).fill(SECOND);
    await send(page).click();
    await expect(sent.filter({ hasText: SECOND })).toHaveCount(1);
    await expect(replies).toHaveCount(2);
    await expect(page.getByText('28 of 30 messages left today')).toBeVisible();
    expect(page.url()).toBe(conversationUrl);

    // Saved: after a reload the whole exchange is there, and no second Conversation appeared.
    await page.reload();
    await expect(sent.filter({ hasText: FIRST })).toHaveCount(1);
    await expect(sent.filter({ hasText: SECOND })).toHaveCount(1);
    await expect(replies).toHaveCount(2);
    await page.goto(`${APP_E2E_URL}${protectedRoutes.ai}`);
    await expect(page.locator('a[href^="/ai/"]:not([href="/ai/"]):visible')).toHaveCount(1);
  } finally {
    await f.context.close();
  }
});

test.describe('visual baselines: SCR-01 default, SCR-03 live and created', () => {
  test('SCR-01 default and SCR-03 Draft card live and created', async ({
    browser,
  }, testInfo) => {
    test.skip(
      SNAPSHOT_PLATFORM !== 'linux',
      'Baselines are Linux-only (CI image); see tests/e2e/README.md'
    );
    testInfo.setTimeout(240_000);
    const f = await openSignedInFreelancer(browser, testInfo, 'ai-visual', {
      seed: { customerName: 'Acme Corp', timeZone: 'UTC' },
      context: { timezoneId: 'UTC', viewport: DESKTOP },
    });
    try {
      const { page } = f;
      // Covered so only the layout is compared: random e-mail addresses, the invoice number in the
      // created confirmation and any dates.
      const volatile = () => [
        page.getByText(/@example\.test/),
        page.getByText(/Draft [A-Z0-9-]+ created\./),
        page.getByText(/\b[A-Z][a-z]{2} \d{1,2}, \d{4}\b/),
        page.getByText(/^\d{1,2} [A-Z][a-z]{2} \d{4}$/),
      ];
      const shot = {
        maxDiffPixelRatio: 0.002,
        animations: 'disabled' as const,
      };

      await page.goto(`${APP_E2E_URL}${protectedRoutes.ai}`);
      await expect(
        page.getByRole('heading', { name: 'Ask about your invoices' })
      ).toBeVisible();
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('ai-section-default.png', {
        ...shot,
        mask: volatile(),
      });

      await page.goto(`${APP_E2E_URL}${protectedRoutes.ai}?start=draft`);
      await message(page).fill(DRAFT_SENTENCE);
      await send(page).click();
      const create = page.getByRole('button', { name: 'Create draft' });
      await expect(create).toBeVisible();
      await expect(page.getByText('1,000.00 USD').first()).toBeVisible();
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('ai-draft-card-live.png', {
        ...shot,
        mask: volatile(),
      });

      await create.click();
      await expect(page.getByText(/Draft [A-Z0-9-]+ created\./)).toBeVisible();
      await expect(page.getByText('Created', { exact: true })).toBeVisible();
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot('ai-draft-card-created.png', {
        ...shot,
        mask: volatile(),
      });
    } finally {
      await f.context.close();
    }
  });
});
