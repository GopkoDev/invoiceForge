// US-04 (test-plan.md e2e-through-UI row AC-07; ux-flows.md US-04 D5 -> D8): moving the due date
// of an overdue invoice in the editor takes it out of overdue on the list.
import { test, expect } from '@playwright/test';
import { openSignedInFreelancer } from '../support/signed-in';
import { readStoredInvoice } from '../support/seed';
import { addDaysToDay, utcDateToDay } from '../../../lib/helpers/calendar-day';
import {
  listRow,
  openEditor,
  openInvoiceList,
} from '../support/invoice-ui';

test.describe.configure({ timeout: 240_000 });

test('AC-07: after moving the due date into the future, the list no longer shows the invoice overdue', async ({
  browser,
}, testInfo) => {
  test.setTimeout(240_000);
  const f = await openSignedInFreelancer(browser, testInfo, 'ii-us04-due', {
    seed: {
      timeZone: 'UTC',
      dueDay: addDaysToDay(utcDateToDay(new Date()), -10),
    },
  });
  try {
    const { page, workspace } = f;
    const { invoiceNumber, invoiceId } = workspace;
    await openInvoiceList(page);
    await expect(listRow(page, invoiceNumber)).toContainText('Overdue');

    await openEditor(page, invoiceId);
    await expect(page.getByText('This invoice is issued.')).toBeVisible();
    // The issue date is today, so "In 14 days" lands two weeks ahead.
    await page.getByRole('button', { name: /^(?!Pick).*,\s*\d{4}$/ }).last().click();
    await page.getByRole('button', { name: 'In 14 days' }).click();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    await expect
      .poll(async () => {
        const stored = await readStoredInvoice(invoiceId);
        return utcDateToDay(stored.dueDate) > utcDateToDay(new Date());
      })
      .toBe(true);
    const stored = await readStoredInvoice(invoiceId);
    expect(stored.status).toBe('PENDING');

    await openInvoiceList(page);
    const row = listRow(page, invoiceNumber);
    await expect(row).toContainText('Pending');
    await expect(row).not.toContainText('Overdue');
  } finally {
    await f.context.close();
  }
});
