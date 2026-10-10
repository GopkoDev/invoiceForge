// editor-ux T35 (AC-09, AC-10; ADR-0006 lib/format en-US; ADR-0002 one InvoiceDocument for preview
// and PDF; review 2026-10-10 T-a): with the browser's language set to uk-UA or de-DE, every place
// that shows an invoice amount writes it the en-US way, "$1,234.50" and "UAH 1,234.50": the
// editor's line amount and summary totals, its preview, the PDF it downloads and the dashboard's
// Debtors card. The amounts are the issued invoice's stored ones (T23, T39): the seeded line's stored
// amount, subtotal and total (1,234.50) differ from price x quantity (1,300.00), so a recalculation shows 1,300.00. Every expected string is
// written out by hand; lib/format, the module under test, never supplies one.
import { test, expect as baseExpect, type Locator, type Page } from '@playwright/test';
import { createTestPrismaClient } from '../support/db/client';
import { createBankAccount } from '../support/factories/bank-account';
import { APP_E2E_URL, readE2eRuntime } from './support/app-server';
import { uniqueTestEmail } from '../support/factories/ids';
import { signInWithSignInLink } from './support/genuine-session';
import { skipWithoutContainerRuntime } from './support/require-container-runtime';
import { seedWorkspace, type SeededWorkspace } from './support/seed';
import { downloadedPdfText } from './support/pdf-download-text';
import { protectedRoutes } from '../../config/routes.config';

test.describe.configure({ timeout: 240_000 });
const expect = baseExpect.configure({ timeout: 20_000 });

const CUSTOMER = 'Locale Customer Ltd';
// Overdue (due in the past, still PENDING), so both invoices are Debtors.
const ISSUE = new Date('2026-01-05T00:00:00Z');
const DUE = new Date('2026-01-19T00:00:00Z');

// What each device language would print for 1234.5 if a screen used the browser's own locale.
const BROWSERS = [
  { locale: 'uk-UA', native: /1\s234,50/ },
  { locale: 'de-DE', native: /1\.234,50/ },
];

// Written out: the en-US amount for each currency, and the same as a regular expression for rows
// whose label and amount sit in sibling elements.
const CURRENCIES = [
  { currency: 'USD', amount: '$1,234.50', pattern: '\\$1,234\\.50', price: '$1,300.00', pricePattern: '\\$1,300\\.00' },
  { currency: 'UAH', amount: 'UAH 1,234.50', pattern: 'UAH\\s1,234\\.50', price: 'UAH 1,300.00', pricePattern: 'UAH\\s1,300\\.00' },
] as const;

const HYDRATION =
  /hydrat|did not match|text content does not match|Minified React error #(418|419|422|423|425)/i;

function watchRenderErrors(page: Page): string[] {
  const found: string[] = [];
  page.on('console', (m) => {
    if ((m.type() === 'error' || m.type() === 'warning') && HYDRATION.test(m.text())) found.push(m.text());
  });
  page.on('pageerror', (e) => {
    if (HYDRATION.test(e.message)) found.push(e.message);
  });
  return found;
}

/**
 * The innermost element in `scope` that holds every one of `parts`: one row, whatever its markup.
 * `parts` are page-rooted locators (a `has` filter is resolved inside each candidate).
 */
function innermost(page: Page, scope: Locator | Page, ...parts: Locator[]): Locator {
  const holding = (from: Locator | Page) => {
    let l = from.locator('div, tr');
    for (const part of parts) l = l.filter({ has: part });
    return l;
  };
  return holding(scope).filter({ hasNot: holding(page) });
}

/**
 * The seeded invoice becomes an overdue USD 1,234.50 one, and a copy of it an overdue UAH 1,234.50 one
 * (stored amounts, T23), on a UAH bank account of its own: the editor takes an invoice's currency
 * from its bank account.
 */
async function seedUsdAndUahDebts(workspace: SeededWorkspace): Promise<Record<'USD' | 'UAH', string>> {
  const prisma = createTestPrismaClient(readE2eRuntime().databaseUrl);
  try {
    const usd = await prisma.invoice.update({
      where: { id: workspace.invoiceId },
      data: {
        issueDate: ISSUE,
        dueDate: DUE,
        status: 'PENDING',
        subtotal: 1234.5,
        taxAmount: 0,
        total: 1234.5,
        items: { updateMany: { where: {}, data: { name: 'Locale Work', quantity: 1, rate: 1300, amount: 1234.5 } } },
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _id, createdAt: _c, updatedAt: _u, ...copy } = usd;
    const uahNumber = workspace.invoiceNumber.replace(/-0001$/, '-0002');
    const uahBank = await createBankAccount(prisma, workspace.senderProfileId, {
      currency: 'UAH',
      bankName: 'Hryvnia Bank',
      accountNumber: '2222222222',
    });
    const uah = await prisma.invoice.create({
      data: {
        ...copy,
        bankAccountId: uahBank.id,
        bankName: uahBank.bankName,
        bankAccountNumber: uahBank.accountNumber,
        invoiceNumber: uahNumber,
        invoiceNumberKey: uahNumber.toLowerCase(),
        currency: 'UAH',
        items: { create: [{ name: 'Locale Work', unit: 'pcs', quantity: 1, rate: 1300, amount: 1234.5 }] },
      } as typeof copy,
    });
    return { USD: workspace.invoiceId, UAH: uah.id };
  } finally {
    await prisma.$disconnect();
  }
}

for (const { locale, native } of BROWSERS) {
  test(`AC-09: browser language ${locale}: editor, preview, PDF and Debtors show $1,234.50 and UAH 1,234.50`, async ({
    browser,
  }, testInfo) => {
    await skipWithoutContainerRuntime(testInfo);
    const email = uniqueTestEmail('eux-t35-money');
    const workspace = await seedWorkspace(email, { customerName: CUSTOMER });
    // Seeded before sign-in: the dashboard caches its currency tabs for 60 s from the first visit,
    // and sign-in lands there.
    const invoiceIds = await seedUsdAndUahDebts(workspace);
    const context = await browser.newContext({ locale, viewport: { width: 1280, height: 800 } });
    try {
      const page = await context.newPage();
      await signInWithSignInLink(page, email);
      const errors = watchRenderErrors(page);

      for (const { currency, amount, pattern, price, pricePattern } of CURRENCIES) {
        await test.step(`${currency}: editor, preview and PDF`, async () => {
          await page.goto(`${APP_E2E_URL}${protectedRoutes.invoiceEdit(invoiceIds[currency])}`);

          // The browser really is in that language: a locale-less formatter writes the amount its way.
          const browserDefault = await page.evaluate(() =>
            new Intl.NumberFormat(undefined, { minimumFractionDigits: 2 }).format(1234.5),
          );
          expect(browserDefault).toMatch(native);

          // Editor line amount
          const line = innermost(page, page, page.getByLabel('Price, line 1'), page.getByLabel('Quantity, line 1'));
          await expect(line).toContainText(amount);
          await expect(line).not.toContainText(native);

          // Editor summary: Subtotal and Total rows
          const summary = page.locator('[data-slot="card"]').filter({ hasText: 'Review and adjust the invoice summary details' });
          await expect(innermost(page, summary, page.getByText('Subtotal', { exact: true }))).toHaveText(
            new RegExp(`^Subtotal\\s*${pattern}$`),
          );
          await expect(innermost(page, summary, page.getByText('Total', { exact: true }))).toHaveText(
            new RegExp(`^Total\\s*${pattern}$`),
          );
          await expect(summary).not.toContainText(native);

          // Preview: the line row and the summary rows
          const preview = page.locator('div').filter({ has: page.getByRole('columnheader', { name: 'Product / Service', exact: true }) }).last();
          await expect(preview.getByRole('row').filter({ hasText: 'Locale Work' })).toHaveText(
            new RegExp(`^Locale Work\\s*${pricePattern}\\s*1\\s.*${pattern}$`),
          );
          await expect(innermost(page, preview, page.getByText('Subtotal:', { exact: true }))).toHaveText(
            new RegExp(`^Subtotal:\\s*${pattern}$`),
          );
          await expect(innermost(page, preview, page.getByText('TOTAL:', { exact: true }))).toHaveText(
            new RegExp(`^TOTAL:\\s*${pattern}$`),
          );
          await expect(preview).not.toContainText(native);
          // Stored, not recalculated (T39): the 1,300.00 price x 1 is never the subtotal or total.
          await expect(innermost(page, preview, page.getByText('TOTAL:', { exact: true }))).not.toContainText(price);

          // The PDF it downloads
          await page.waitForLoadState('networkidle');
          const download = page.waitForEvent('download', { timeout: 90_000 });
          await page.getByRole('button', { name: 'Download PDF' }).click();
          const pdf = await downloadedPdfText(await download);
          expect(pdf).toMatch(new RegExp(`Locale Work ${pricePattern} 1 .*${pattern}`));
          expect(pdf).toContain(`Subtotal: ${amount}`);
          expect(pdf).toContain(`TOTAL: ${amount}`);
          expect(pdf).not.toMatch(native);
          expect(pdf).not.toContain(`TOTAL: ${price}`);
          expect(pdf).not.toContain(`Subtotal: ${price}`);
        });

        await test.step(`${currency}: dashboard Debtors`, async () => {
          await page.goto(`${APP_E2E_URL}${protectedRoutes.dashboard}?currency=${currency}`);
          const debtors = page.getByRole('list', { name: 'Debtors' });
          const debtor = debtors.getByRole('listitem').filter({ hasText: CUSTOMER });
          await expect(debtor).toContainText(amount);
          await expect(debtor.getByLabel(`Total overdue: ${amount}`)).toHaveText(new RegExp(`^${pattern}$`));
          await expect(debtor).not.toContainText(native);
          await page.waitForLoadState('networkidle');
        });
      }

      expect(errors, 'render-mismatch / hydration console messages').toEqual([]);
    } finally {
      await context.close();
    }
  });
}
