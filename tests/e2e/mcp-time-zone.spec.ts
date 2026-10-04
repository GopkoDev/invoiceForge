// AC-22 (test-plan.md, e2e-through-UI): the browser's zone is saved on the first visit, shown in
// settings, and a change moves "today" on the dashboard.
import { test, expect, type Page } from '@playwright/test';
import { APP_E2E_URL } from './support/app-server';
import {
  openSignedInFreelancer,
  readSavedTimeZone,
} from './support/signed-in';
import { protectedRoutes } from '../../config/routes.config';

test.describe.configure({ timeout: 240_000 });

const zoneInput = (page: Page) =>
  page.getByRole('combobox', { name: 'Time zone' });

test('AC-22: a Kyiv browser has its zone saved on the first visit and shown in settings', async ({
  browser,
}, testInfo) => {
  const { context, page, workspace } = await openSignedInFreelancer(
    browser,
    testInfo,
    'mcp-tz-first',
    { context: { timezoneId: 'Europe/Kyiv' } }
  );
  try {
    await page.goto(`${APP_E2E_URL}${protectedRoutes.dashboard}`);
    const browserZone = await page.evaluate(
      () => Intl.DateTimeFormat().resolvedOptions().timeZone
    );
    expect(browserZone).toMatch(/Kyiv|Kiev/);
    await expect
      .poll(() => readSavedTimeZone(workspace.userId), { timeout: 30_000 })
      .toBe(browserZone);

    await page.goto(`${APP_E2E_URL}${protectedRoutes.settingsProfile}`);
    await expect(zoneInput(page)).toHaveValue(new RegExp(browserZone));
  } finally {
    await context.close();
  }
});

test('AC-22: changing the zone in settings changes what the dashboard shows as overdue', async ({
  browser,
}, testInfo) => {
  // Pago Pago (UTC-11) and Kiritimati (UTC+14) are 25 hours apart, so their calendar days always
  // differ: an invoice due on Pago Pago's today is due today there and past due on Kiritimati.
  const dueDay = new Date().toLocaleDateString('en-CA', {
    timeZone: 'Pacific/Pago_Pago',
  });
  const { context, page, workspace } = await openSignedInFreelancer(
    browser,
    testInfo,
    'mcp-tz-change',
    { seed: { timeZone: 'Pacific/Pago_Pago', dueDay } }
  );
  try {
    const row = () =>
      page.getByRole('row').filter({ hasText: workspace.invoiceNumber });

    await page.goto(`${APP_E2E_URL}${protectedRoutes.dashboard}`);
    await expect(row()).toContainText('Pending');
    await expect(row()).not.toContainText('Overdue');

    await page.goto(`${APP_E2E_URL}${protectedRoutes.settingsProfile}`);
    await expect(zoneInput(page)).toHaveValue(/Pacific\/Pago_Pago/);
    await zoneInput(page).fill('Pacific/Kiritimati');
    await page.getByRole('option', { name: /^Pacific\/Kiritimati/ }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Time zone saved.')).toBeVisible();
    expect(await readSavedTimeZone(workspace.userId)).toBe(
      'Pacific/Kiritimati'
    );

    await page.goto(`${APP_E2E_URL}${protectedRoutes.dashboard}`);
    await expect(row()).toContainText('Overdue');
  } finally {
    await context.close();
  }
});
