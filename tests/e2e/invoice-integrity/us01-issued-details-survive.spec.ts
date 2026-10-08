// US-01 (test-plan.md e2e-through-UI rows AC-01 and AC-02; ux-flows.md US-01 A3 -> A5, A6 -> A9):
// an issued invoice keeps the sender, Customer and bank details it was issued with, however the
// records change afterwards; a draft follows the records on each save and freezes when issued.
import { test, expect } from '@playwright/test';
import { openSignedInFreelancer } from '../support/signed-in';
import {
  changeLiveRecords,
  readStoredInvoice,
} from '../support/seed';
import {
  chooseRowAction,
  notesField,
  openEditor,
  openInvoiceList,
} from '../support/invoice-ui';

test.describe.configure({ timeout: 240_000 });

test('AC-01: after the records change, the editor and the PDF still show the old issued details', async ({
  browser,
}, testInfo) => {
  test.setTimeout(240_000);
  const f = await openSignedInFreelancer(browser, testInfo, 'ii-us01-issued', {
    seed: {
      status: 'PAID',
      senderLegalName: 'Old Legal Name LLC',
      customerAddress: '1 Old Road',
      bankIban: 'DE00OLDIBAN0000',
    },
  });
  try {
    const { page, workspace } = f;
    await changeLiveRecords(workspace, {
      senderLegalName: 'New Legal Name GmbH',
      customerAddress: '9 New Boulevard',
      bankIban: 'FR99NEWIBAN9999',
    });

    // A3: the issued editor shows the issued details, not the changed records.
    await openEditor(page, workspace.invoiceId);
    await expect(page.getByText('Old Legal Name LLC').first()).toBeVisible();
    await expect(page.getByText('1 Old Road').first()).toBeVisible();
    await expect(page.getByText('DE00OLDIBAN0000').first()).toBeVisible();
    await expect(page.getByText('New Legal Name GmbH')).toHaveCount(0);
    await expect(page.getByText('9 New Boulevard')).toHaveCount(0);
    await expect(page.getByText('FR99NEWIBAN9999')).toHaveCount(0);

    // A4: a notes-only save changes the notes and nothing else.
    await notesField(page).fill('Thanks for your business');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect
      .poll(async () => (await readStoredInvoice(workspace.invoiceId)).notes)
      .toBe('Thanks for your business');
    const stored = await readStoredInvoice(workspace.invoiceId);
    expect(stored.senderLegalName).toBe('Old Legal Name LLC');
    expect(stored.customerAddress).toBe('1 Old Road');
    expect(stored.bankIban).toBe('DE00OLDIBAN0000');
    expect(stored.status).toBe('PAID');
    expect(Number(stored.total)).toBe(100);

    // Reopening after the save: still the issued details.
    await openEditor(page, workspace.invoiceId);
    await expect(page.getByText('Old Legal Name LLC').first()).toBeVisible();
    await expect(page.getByText('New Legal Name GmbH')).toHaveCount(0);

    // A5: the document preview and the downloaded file are built from the same issued details.
    await openInvoiceList(page);
    await chooseRowAction(page, workspace.invoiceNumber, 'View Document');
    const preview = page.getByRole('dialog');
    await expect(preview.getByText('1 Old Road')).toBeVisible();
    await expect(preview.getByText('IBAN: DE00OLDIBAN0000')).toBeVisible();
    await expect(preview.getByText('9 New Boulevard')).toHaveCount(0);
    await expect(preview.getByText('FR99NEWIBAN9999')).toHaveCount(0);
    await page.keyboard.press('Escape');

    const download = page.waitForEvent('download');
    await chooseRowAction(page, workspace.invoiceNumber, 'Download PDF');
    const file = await (await download).createReadStream();
    const head: Buffer[] = [];
    for await (const chunk of file) {
      head.push(chunk as Buffer);
      break;
    }
    expect(Buffer.concat(head).subarray(0, 5).toString()).toBe('%PDF-');
  } finally {
    await f.context.close();
  }
});

test('AC-02: a draft follows the corrected Customer on save, and stops following once issued', async ({
  browser,
}, testInfo) => {
  test.setTimeout(240_000);
  const f = await openSignedInFreelancer(browser, testInfo, 'ii-us01-draft', {
    seed: { status: 'DRAFT', customerAddress: '1 Typo Street' },
  });
  try {
    const { page, workspace } = f;
    await changeLiveRecords(workspace, { customerAddress: '2 Corrected Street' });

    // A6: the draft is fully editable and shows the corrected record; saving stores it.
    await openEditor(page, workspace.invoiceId);
    await expect(page.getByText('2 Corrected Street').first()).toBeVisible();
    expect((await readStoredInvoice(workspace.invoiceId)).customerAddress).toBe('1 Typo Street');
    await notesField(page).fill('Draft note');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect
      .poll(async () => (await readStoredInvoice(workspace.invoiceId)).customerAddress)
      .toBe('2 Corrected Street');

    // A7 -> A9: issue from the editor; the details of that save are now fixed.
    await page.getByRole('button', { name: 'Save and issue' }).click();
    await expect
      .poll(async () => (await readStoredInvoice(workspace.invoiceId)).status)
      .toBe('PENDING');

    await changeLiveRecords(workspace, { customerAddress: '3 Later Avenue' });

    await openEditor(page, workspace.invoiceId);
    await expect(page.getByText('2 Corrected Street').first()).toBeVisible();
    await expect(page.getByText('3 Later Avenue')).toHaveCount(0);
    await expect(page.getByText('As issued on this invoice.').first()).toBeVisible();

    await openInvoiceList(page);
    await chooseRowAction(page, workspace.invoiceNumber, 'View Document');
    const preview = page.getByRole('dialog');
    await expect(preview.getByText('2 Corrected Street')).toBeVisible();
    await expect(preview.getByText('3 Later Avenue')).toHaveCount(0);
  } finally {
    await f.context.close();
  }
});
