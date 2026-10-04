// AC-24 (test-plan.md, e2e-through-UI): an unpaid invoice past its due day, never marked by hand,
// shows as overdue on the dashboard, the invoice list, the customer page and the invoice page.
import { test, expect, type Page } from '@playwright/test';
import { APP_E2E_URL } from './support/app-server';
import {
  openSignedInFreelancer,
  type SignedInFreelancer,
} from './support/signed-in';
import { addDaysToDay, utcDateToDay } from '../../lib/helpers/calendar-day';
import { protectedRoutes } from '../../config/routes.config';

test.describe.configure({ mode: 'serial', timeout: 150_000 });

test.describe('AC-24 a past-due unmarked invoice is overdue on every surface', () => {
  let freelancer: SignedInFreelancer;
  let page: Page;

  test.beforeAll(async ({ browser }, testInfo) => {
    test.setTimeout(240_000);
    // Ten days past due, with UTC as the Freelancer zone: past due in any reading.
    freelancer = await openSignedInFreelancer(browser, testInfo, 'mcp-overdue', {
      seed: {
        timeZone: 'UTC',
        dueDay: addDaysToDay(utcDateToDay(new Date()), -10),
      },
    });
    page = freelancer.page;
  });

  test.afterAll(async () => {
    await freelancer?.context.close();
  });

  const row = () =>
    page
      .getByRole('row')
      .filter({ hasText: freelancer.workspace.invoiceNumber });

  test('dashboard recent invoices', async () => {
    await page.goto(`${APP_E2E_URL}${protectedRoutes.dashboard}`);
    await expect(row()).toContainText('Overdue');
  });

  test('invoice list', async () => {
    await page.goto(`${APP_E2E_URL}${protectedRoutes.invoices}`);
    await expect(row()).toContainText('Overdue');
    await expect(row()).not.toContainText('Pending');
  });

  test('customer page', async () => {
    await page.goto(
      `${APP_E2E_URL}${protectedRoutes.customerDetail(freelancer.workspace.customerId)}`
    );
    await expect(
      page.getByText(freelancer.workspace.invoiceNumber).first()
    ).toBeVisible();
    await expect(
      page.getByText('Overdue', { exact: true }).first()
    ).toBeVisible();
  });

  test('invoice page', async () => {
    await page.goto(
      `${APP_E2E_URL}${protectedRoutes.invoiceEdit(freelancer.workspace.invoiceId)}`
    );
    await expect(page.getByText('Overdue', { exact: true })).toBeVisible();
  });
});
