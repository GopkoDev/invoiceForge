// AC-01, AC-02, AC-06 (test-plan.md, e2e-through-UI): connect an Assistant, see the new key exactly
// once, revoke it. One Freelancer per describe, a genuine session, the production build.
import { test, expect, type Page } from '@playwright/test';
import { APP_E2E_URL } from './support/app-server';
import {
  openSignedInFreelancer,
  type SignedInFreelancer,
} from './support/signed-in';
import { protectedRoutes } from '../../config/routes.config';

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
    await page.getByRole('link', { name: /Connect your AI/ }).click();
    await expect(page).toHaveURL(
      new RegExp(`${protectedRoutes.settingsAssistants}$`)
    );
    await expect(connectHeading()).toBeVisible();
  });

  test('AC-01: the settings navigation opens the connect page', async () => {
    await page.goto(`${APP_E2E_URL}${protectedRoutes.settingsProfile}`);
    await page.getByRole('link', { name: 'Connect your AI' }).click();
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
