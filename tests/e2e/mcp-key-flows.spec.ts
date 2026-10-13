// AC-01, AC-02, AC-06 (test-plan.md, e2e-through-UI): connect an Assistant, see the new key exactly
// once, revoke it. One Freelancer per describe, a genuine session, the production build.
import { test, expect, type Page } from '@playwright/test';
import { createTestPrismaClient } from '../support/db/client';
import { APP_E2E_URL, readE2eRuntime } from './support/app-server';
import {
  openSignedInFreelancer,
  type SignedInFreelancer,
} from './support/signed-in';
import { MCP_PATH, protectedRoutes } from '../../config/routes.config';

test.describe.configure({ mode: 'serial', timeout: 150_000 });

const KEY_NAME = 'Laptop assistant';

const section = (page: Page, heading: string | RegExp) =>
  page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: heading }) });

test.describe('Connect your AI: reach it, create a key, revoke it', () => {
  let freelancer: SignedInFreelancer;
  let page: Page;

  test.beforeAll(async ({ browser }, testInfo) => {
    test.setTimeout(240_000);
    // UTC pins the zone the key dates are shown in (seeded from the browser on the first visit).
    freelancer = await openSignedInFreelancer(browser, testInfo, 'mcp-keys', {
      context: { timezoneId: 'UTC' },
    });
    page = freelancer.page;
  });

  test.afterAll(async () => {
    await freelancer?.context.close();
  });

  const connectHeading = () =>
    page.getByRole('heading', { name: 'Connect your AI', level: 1 });

  test('AC-01: the dashboard entry point opens the connect page', async () => {
    await page.goto(`${APP_E2E_URL}${protectedRoutes.dashboard}`);
    // ai-chat-v2 T25: the sidebar's "Connect your AI" item also matches a loose name; this is the banner entry.
    await page.getByRole('link', { name: 'Connect your AI →', exact: true }).click();
    await expect(page).toHaveURL(
      new RegExp(`${protectedRoutes.settingsAssistants}$`)
    );
    await expect(connectHeading()).toBeVisible();
  });

  test('AC-01: the settings navigation opens the connect page', async () => {
    await page.goto(`${APP_E2E_URL}${protectedRoutes.settingsProfile}`);
    // ai-chat-v2 T25: the sidebar's AI group also has "Connect your AI"; this is the settings page's own navigation.
    await page.getByRole('main').getByRole('link', { name: 'Connect your AI' }).click();
    await expect(page).toHaveURL(
      new RegExp(`${protectedRoutes.settingsAssistants}$`)
    );
    await expect(connectHeading()).toBeVisible();
  });

  let lastFour = '';

  test('AC-02: the new key is shown once and is gone after a reload', async () => {
    await page.goto(`${APP_E2E_URL}${protectedRoutes.settingsAssistants}`);
    await page.getByLabel('Key name').fill(KEY_NAME);
    await page.getByRole('button', { name: 'Create key' }).click();

    const shown = page.getByLabel('New key');
    await expect(shown).toBeVisible();
    await expect(
      page.getByText("You won't be able to see it again.")
    ).toBeVisible();
    const fullKey = await shown.inputValue();
    expect(fullKey).toMatch(/^ifk_/);
    lastFour = fullKey.slice(-4);

    await page.reload();
    await expect(connectHeading()).toBeVisible();
    await expect(page.getByLabel('New key')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText(fullKey);
    const active = section(page, /^Active keys/);
    await expect(active.getByText(KEY_NAME)).toBeVisible();
    await expect(
      active.getByText(/^Created \w{3} \d{1,2}, \d{4}$/)
    ).toBeVisible();
    await expect(active.getByText(`••••${lastFour}`)).toBeVisible();
    await expect(active.getByText('Never used')).toBeVisible();
  });

  test('AC-06: revoking after confirming moves the key to the revoked list', async () => {
    await page.goto(`${APP_E2E_URL}${protectedRoutes.settingsAssistants}`);
    await page.getByRole('button', { name: `Revoke ${KEY_NAME}` }).click();
    await page.getByRole('button', { name: 'Revoke key' }).click();

    const today = new Date().toLocaleDateString('en-US', {
      timeZone: 'UTC',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
    const revoked = section(page, 'Revoked keys');
    await expect(revoked.getByText(KEY_NAME)).toBeVisible();
    await expect(revoked.getByText(`Revoked ${today}`)).toBeVisible();
    await expect(revoked.getByText(`••••${lastFour}`)).toBeVisible();
    await expect(revoked.getByRole('button')).toHaveCount(0);
    await expect(
      section(page, /^Active keys/).getByText(KEY_NAME)
    ).toHaveCount(0);

    // Still revoked after a reload: the move was saved, not just drawn.
    await page.reload();
    await expect(
      section(page, 'Revoked keys').getByText(KEY_NAME)
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: `Revoke ${KEY_NAME}` })
    ).toHaveCount(0);
  });
});

// ai-chat-v2 T31 (AC-06): a key without Draft permission reads sender profiles, products and Customers through the
// real proxy and handler of the production build, with record ids and never a full account number.
test.describe('AC-06 (ai-chat-v2): a read-only key reads profiles, products and Customers', () => {
  const FULL_NUMBER = '4400556677881234';
  let freelancer: SignedInFreelancer;
  let fullKey = '';

  test.beforeAll(async ({ browser }, testInfo) => {
    test.setTimeout(240_000);
    freelancer = await openSignedInFreelancer(browser, testInfo, 'mcp-v2-reads', {
      seed: { customerName: 'Acme Corp', timeZone: 'UTC' },
      context: { timezoneId: 'UTC' },
    });
    const prisma = createTestPrismaClient(readE2eRuntime().databaseUrl);
    try {
      await prisma.bankAccount.updateMany({
        where: { senderProfileId: freelancer.workspace.senderProfileId },
        data: { accountNumber: FULL_NUMBER },
      });
    } finally {
      await prisma.$disconnect();
    }
    const { page } = freelancer;
    await page.goto(`${APP_E2E_URL}${protectedRoutes.settingsAssistants}`);
    await page.getByLabel('Key name').fill('Read-only assistant');
    await page.getByRole('button', { name: 'Create key' }).click();
    fullKey = await page.getByLabel('New key').inputValue();
    expect(fullKey).toMatch(/^ifk_/);
  });

  test.afterAll(async () => {
    await freelancer?.context.close();
  });

  test('list_sender_profiles, list_products and list_customers answer with ids and no full account number', async ({
    playwright,
  }) => {
    const outside = await playwright.request.newContext();
    try {
      let id = 0;
      const call = async (name: string, args: Record<string, unknown> = {}) => {
        const response = await outside.post(`${APP_E2E_URL}${MCP_PATH}`, {
          headers: {
            authorization: `Bearer ${fullKey}`,
            accept: 'application/json, text/event-stream',
          },
          data: { jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } },
          maxRedirects: 0,
        });
        expect(response.status(), name).toBe(200);
        const text = await response.text();
        expect(text, `${name}: no full account number`).not.toContain(FULL_NUMBER);
        const body = JSON.parse(text.startsWith('{') ? text : text.split('\n').find((l) => l.startsWith('data: '))!.slice(6));
        expect(body.result.isError ?? false, name).toBe(false);
        return body.result.structuredContent;
      };

      const profiles = await call('list_sender_profiles');
      expect(profiles.rows).toHaveLength(1);
      expect(profiles.rows[0].senderProfileId).toBe(freelancer.workspace.senderProfileId);
      expect(profiles.rows[0].bankAccounts[0]).toMatchObject({ lastFour: '1234', currency: 'USD' });

      const products = await call('list_products');
      expect(products.rows.map((p: { productId: string }) => p.productId)).toContain(freelancer.workspace.productId);

      const customers = await call('list_customers', { name: 'acme  CORP' });
      expect(customers.rows.map((c: { customerId: string }) => c.customerId)).toEqual([freelancer.workspace.customerId]);
      expect(customers.pageInfo).toBeDefined();
    } finally {
      await outside.dispose();
    }
  });
});
