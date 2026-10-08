// US-11 (test-plan.md e2e row AC-23): a direct link to another Freelancer's invoice renders the
// same not-found screen as a link to an invoice that does not exist.
import { test, expect } from '@playwright/test';
import { openSignedInFreelancer } from '../support/signed-in';
import { seedWorkspace } from '../support/seed';
import { uniqueTestEmail } from '../../support/factories/ids';
import { APP_E2E_URL } from '../support/app-server';
import { protectedRoutes } from '../../../config/routes.config';

test.describe.configure({ timeout: 240_000 });

test('AC-23: a foreign invoice link and a missing invoice link render the identical not-found screen', async ({
  browser,
}, testInfo) => {
  test.setTimeout(240_000);
  const a = await openSignedInFreelancer(browser, testInfo, 'ii-us11-a');
  try {
    const foreign = await seedWorkspace(uniqueTestEmail('ii-us11-b'), {
      customerName: 'Foreign Customer Ltd',
    });
    const { page } = a;
    const screen = async (id: string) => {
      await page.goto(`${APP_E2E_URL}${protectedRoutes.invoiceEdit(id)}`);
      // Scoped to the not-found card: the editor layout has no <main>, and the page body would
      // pull in route-announcer and toast text that differs between two navigations.
      const notFound = page
        .locator('[data-slot="card"]')
        .filter({ has: page.getByRole('heading', { name: 'Invoice Not Found' }) });
      await expect(notFound).toBeVisible();
      return notFound.innerText();
    };
    const foreignText = await screen(foreign.invoiceId);
    const foreignPage = await page.locator('body').innerText();
    const missingText = await screen('cl0000000000000000000000x');

    expect(foreignText).toBe(missingText);
    expect(foreignText).toContain(
      "The invoice you're trying to edit doesn't exist or you don't have access to it."
    );
    await expect(page.getByRole('link', { name: 'Back to Invoices' })).toBeVisible();
    // Nothing of the other Freelancer's invoice reaches the page.
    // Checked on the whole page of the foreign link, not only the card.
    expect(foreignPage).not.toContain(foreign.invoiceNumber);
    expect(foreignPage).not.toContain('Foreign Customer Ltd');
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
  } finally {
    await a.context.close();
  }
});
