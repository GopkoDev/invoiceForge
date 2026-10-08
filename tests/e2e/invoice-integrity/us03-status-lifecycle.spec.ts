// US-03 (test-plan.md e2e-through-UI rows AC-04 and AC-06; ux-flows.md US-03 C6, C7 -> C9):
// the list moves an invoice through its lifecycle, and a cancelled invoice is final.
import { test, expect } from '@playwright/test';
import { openSignedInFreelancer } from '../support/signed-in';
import { readStoredInvoice } from '../support/seed';
import {
  chooseRowAction,
  listRow,
  notesField,
  openEditor,
  openInvoiceList,
  rowMenuItem,
} from '../support/invoice-ui';

test.describe.configure({ timeout: 240_000 });

test('AC-04: mark paid shows the payment date, undo to pending clears it', async ({
  browser,
}, testInfo) => {
  test.setTimeout(240_000);
  const f = await openSignedInFreelancer(browser, testInfo, 'ii-us03-paid', {
    seed: { timeZone: 'UTC' },
  });
  try {
    const { page, workspace } = f;
    const { invoiceNumber, invoiceId } = workspace;
    await openInvoiceList(page);
    const row = listRow(page, invoiceNumber);
    await expect(row).toContainText('Pending');

    await chooseRowAction(page, invoiceNumber, 'Mark as Paid');
    await expect(row).toContainText('Paid');
    await expect(row).not.toContainText('Pending');
    // The badge carries the payment date.
    await expect(row.getByText(/Paid\s+\S+/)).toBeVisible();
    const paid = await readStoredInvoice(invoiceId);
    expect(paid.status).toBe('PAID');
    expect(paid.paidAt).not.toBeNull();

    // A paid row offers the undo to pending, never a move back to draft.
    await (await rowMenuItem(page, invoiceNumber, /Mark as Pending/)).waitFor();
    await expect(page.getByRole('menuitem', { name: /draft/i })).toHaveCount(0);
    await page.getByRole('menuitem', { name: /Mark as Pending/ }).click();

    await expect(row).toContainText('Pending');
    await expect(row).not.toContainText('Paid');
    const pending = await readStoredInvoice(invoiceId);
    expect(pending.status).toBe('PENDING');
    expect(pending.paidAt).toBeNull();
  } finally {
    await f.context.close();
  }
});

test('AC-06: cancelling asks for confirmation (SCR-04) and, once confirmed, the row shows cancelled', async ({
  browser,
}, testInfo) => {
  test.setTimeout(240_000);
  const f = await openSignedInFreelancer(browser, testInfo, 'ii-us03-cancel', {
    seed: { timeZone: 'UTC' },
  });
  try {
    const { page, workspace } = f;
    const { invoiceNumber, invoiceId } = workspace;
    await openInvoiceList(page);
    const row = listRow(page, invoiceNumber);

    // SCR-04: the confirmation states that cancelling is final; keeping changes nothing.
    await chooseRowAction(page, invoiceNumber, 'Cancel Invoice');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText(`Cancel invoice ${invoiceNumber}?`);
    await expect(dialog).toContainText('A cancelled invoice is final');
    await dialog.getByRole('button', { name: 'Keep invoice' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(row).toContainText('Pending');
    expect((await readStoredInvoice(invoiceId)).status).toBe('PENDING');

    await chooseRowAction(page, invoiceNumber, 'Cancel Invoice');
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel invoice' }).click();
    await expect(row).toContainText('Cancelled');
    expect((await readStoredInvoice(invoiceId)).status).toBe('CANCELLED');
  } finally {
    await f.context.close();
  }
});

test('AC-06: a cancelled invoice is read-only, its row offers four actions, and Duplicate opens an editable draft', async ({
  browser,
}, testInfo) => {
  test.setTimeout(240_000);
  const f = await openSignedInFreelancer(browser, testInfo, 'ii-us03-final', {
    seed: { timeZone: 'UTC', status: 'CANCELLED' },
  });
  try {
    const { page, workspace } = f;
    const { invoiceNumber, invoiceId } = workspace;
    await openInvoiceList(page);
    await expect(listRow(page, invoiceNumber)).toContainText('Cancelled');

    // The cancelled row offers view, download, print and Duplicate only.
    await (await rowMenuItem(page, invoiceNumber, 'Duplicate')).waitFor();
    await expect(page.getByRole('menuitem')).toHaveText([
      'View Document',
      'Download PDF',
      'Print',
      'Duplicate',
    ]);
    await page.keyboard.press('Escape');

    // The cancelled invoice opens read-only, with no Save.
    await openEditor(page, invoiceId);
    await expect(page.getByText("A cancelled invoice is final and can't be changed.")).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Save and issue' })).toHaveCount(0);
    await expect(notesField(page)).toBeDisabled();

    // Duplicate: a new draft, fully editable; the cancelled source stays cancelled.
    await openInvoiceList(page);
    await chooseRowAction(page, invoiceNumber, 'Duplicate');
    await expect(page.getByText(/Duplicated as /)).toBeVisible();
    const draftRow = page.getByRole('row').filter({ hasText: 'Draft' });
    await expect(draftRow).toHaveCount(1);
    await draftRow.getByRole('link').first().click();
    await expect(page.getByRole('button', { name: 'Save and issue' })).toBeVisible();
    await expect(notesField(page)).toBeEnabled();
    await expect(page.getByText('This invoice is issued.')).toHaveCount(0);
    expect((await readStoredInvoice(invoiceId)).status).toBe('CANCELLED');
  } finally {
    await f.context.close();
  }
});
