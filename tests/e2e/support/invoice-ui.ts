// Shared UI handles for the invoice-integrity e2e-through-UI specs: the list row of one invoice,
// its action menu, and the editor's fields, found by what the Freelancer sees.
import { expect, type Locator, type Page } from '@playwright/test';
import { APP_E2E_URL } from './app-server';
import { protectedRoutes } from '../../../config/routes.config';

export async function openInvoiceList(page: Page): Promise<void> {
  await page.goto(`${APP_E2E_URL}${protectedRoutes.invoices}`);
}

export async function openEditor(page: Page, invoiceId: string): Promise<void> {
  await page.goto(`${APP_E2E_URL}${protectedRoutes.invoiceEdit(invoiceId)}`);
  // The header's title; "Untitled Invoice" is the pre-load placeholder.
  const title = page.locator('h1.truncate');
  await expect(title).toBeVisible();
  await expect(title).not.toHaveText('Untitled Invoice');
}

export function listRow(page: Page, invoiceNumber: string): Locator {
  return page.getByRole('row').filter({ hasText: invoiceNumber });
}

/** Opens a row's action menu and returns the menu item with this name. */
export async function rowMenuItem(
  page: Page,
  invoiceNumber: string,
  name: string | RegExp
): Promise<Locator> {
  await listRow(page, invoiceNumber)
    .getByRole('button', { name: `Actions for ${invoiceNumber}` })
    .click();
  return page.getByRole('menuitem', { name });
}

export async function chooseRowAction(
  page: Page,
  invoiceNumber: string,
  name: string | RegExp
): Promise<void> {
  await (await rowMenuItem(page, invoiceNumber, name)).click();
}

export const notesField = (page: Page): Locator =>
  page.getByPlaceholder('Additional information for the client...');
