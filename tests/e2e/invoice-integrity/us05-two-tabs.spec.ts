// US-05 (test-plan.md e2e-through-UI row AC-10; ux-flows.md US-05 E2 -> E4 -> E5): a save from an
// editor tab opened before the invoice was paid in another tab is refused, and a reload shows paid.
import { test, expect } from '@playwright/test';
import { openSignedInFreelancer } from '../support/signed-in';
import { readStoredInvoice } from '../support/seed';
import {
  chooseRowAction,
  listRow,
  notesField,
  openEditor,
  openInvoiceList,
} from '../support/invoice-ui';

test.describe.configure({ timeout: 240_000 });

test('AC-10: a stale editor save opens the changed-elsewhere dialog and stores nothing; reload shows paid', async ({
  browser,
}, testInfo) => {
  test.setTimeout(240_000);
  const f = await openSignedInFreelancer(browser, testInfo, 'ii-us05-tabs', {
    seed: { timeZone: 'UTC' },
  });
  try {
    const { context, page: editorTab, workspace } = f;
    const { invoiceNumber, invoiceId } = workspace;

    // Tab 1: the editor, opened while the invoice is pending.
    await openEditor(editorTab, invoiceId);
    await expect(editorTab.getByText('Pending', { exact: true })).toBeVisible();

    // Tab 2: the list marks it paid.
    const listTab = await context.newPage();
    await openInvoiceList(listTab);
    await chooseRowAction(listTab, invoiceNumber, 'Mark as Paid');
    await expect(listRow(listTab, invoiceNumber)).toContainText('Paid');
    await listTab.close();

    // Tab 1: editing the notes and saving is refused.
    await notesField(editorTab).fill('Written from the old view');
    await editorTab.getByRole('button', { name: 'Save', exact: true }).click();
    const dialog = editorTab.getByRole('dialog');
    await expect(dialog).toContainText('This invoice changed elsewhere');
    await expect(dialog).toContainText('Reloading discards your unsaved changes.');
    const after = await readStoredInvoice(invoiceId);
    expect(after.notes).toBeNull();
    expect(after.status).toBe('PAID');
    expect(after.paidAt).not.toBeNull();

    // Reload: the current invoice, paid, with the unsaved edit gone.
    await dialog.getByRole('button', { name: 'Reload invoice' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(editorTab.getByText('Paid', { exact: true })).toBeVisible();
    await expect(notesField(editorTab)).toHaveValue('');
  } finally {
    await f.context.close();
  }
});
