// AC-19 (test-plan.md, e2e-through-UI): an invoice link from an Assistant answer, opened with no
// session, goes through sign-in and comes back to the invoice with its status badge. The link is
// the page the endpoint itself links to (lib/mcp/tools/invoice.ts).
import { test, expect } from '@playwright/test';
import { skipWithoutContainerRuntime } from './support/require-container-runtime';
import { APP_E2E_URL } from './support/app-server';
import { signInWithSignInLink } from './support/genuine-session';
import { seedWorkspace } from './support/seed';
import { uniqueTestEmail } from '../support/factories/ids';
import { protectedRoutes } from '../../config/routes.config';

test.describe.configure({ timeout: 240_000 });

test('AC-19: the invoice link leads through sign-in back to the invoice', async ({
  browser,
}, testInfo) => {
  await skipWithoutContainerRuntime(testInfo);
  const email = uniqueTestEmail('mcp-link');
  const { invoiceId } = await seedWorkspace(email);
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const link = protectedRoutes.invoiceEdit(invoiceId);

    await signInWithSignInLink(page, email, { from: link });

    await expect(page).toHaveURL(`${APP_E2E_URL}${link}`);
    await expect(page.getByText('Pending', { exact: true })).toBeVisible();
  } finally {
    await context.close();
  }
});
