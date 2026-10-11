// editor-ux T19, T34 (AC-08; spec §6 NFR "Server/browser date agreement"; sad.md §10 QG-2): with the
// Freelancer zone at UTC-10, UTC and UTC+14, a browser in a different zone and the browser clock
// 5 minutes either side of the Freelancer's midnight, no page logs a hydration/render-mismatch
// error and every issue/due date shown is the stored calendar day: the invoices list, the dashboard,
// a Customer's related invoices, the editor, its preview and the downloaded PDF. Every expected
// string is written out by hand (ADR-0006: lib/format is the module under test, so it never
// supplies the expectation). The server's own clock cannot be faked, so the stored days sit in the
// future and never depend on it; a new invoice's "today" is read from the real clock in the test.
import { test, expect as baseExpect, type Locator, type Page } from '@playwright/test';
import { createTestPrismaClient } from '../support/db/client';
import { APP_E2E_URL, readE2eRuntime } from './support/app-server';
import { openSignedInFreelancer } from './support/signed-in';
import { setBrowserClock } from './support/browser-clock';
import { downloadedPdfText } from './support/pdf-download-text';
import { protectedRoutes } from '../../config/routes.config';

test.describe.configure({ timeout: 240_000 });
const expect = baseExpect.configure({ timeout: 20_000 });

const ISSUE = new Date('2027-03-15T00:00:00Z');
const DUE = new Date('2027-03-29T00:00:00Z');
// A second invoice of the same Customer, so each date check reads its own invoice's row.
const OTHER_ISSUE = new Date('2027-03-02T00:00:00Z');
const OTHER_DUE = new Date('2027-03-09T00:00:00Z');
const CUSTOMER = 'Matrix Customer Ltd';
// A custom price created at 23:30 UTC on Mar 15: Mar 16 in UTC+14, Mar 15 in UTC. For UTC-10 it is
// created at 00:30 UTC on Mar 16 instead, which is Mar 15 there, so that zone also shows a day that
// differs from UTC's (review r12 N2, T86).
const CUSTOM_PRICE_CREATED = new Date('2027-03-15T23:30:00Z');
const CUSTOM_PRICE_CREATED_AFTER_UTC_MIDNIGHT = new Date('2027-03-16T00:30:00Z');

// Offset (hours) of each Freelancer zone on 2027-03-15, a browser zone that differs from it, and
// the custom price's creation moment and the day it falls on in the Freelancer zone.
const ZONES = [
  {
    zone: 'Pacific/Honolulu' as string | null,
    offset: -10,
    browser: 'Pacific/Kiritimati',
    customPriceCreated: CUSTOM_PRICE_CREATED_AFTER_UTC_MIDNIGHT,
    customPriceDay: 'Mar 15, 2027',
  },
  {
    zone: 'UTC' as string | null,
    offset: 0,
    browser: 'Pacific/Honolulu',
    customPriceCreated: CUSTOM_PRICE_CREATED,
    customPriceDay: 'Mar 15, 2027',
  },
  {
    zone: 'Pacific/Kiritimati' as string | null,
    offset: 14,
    browser: 'Pacific/Honolulu',
    customPriceCreated: CUSTOM_PRICE_CREATED,
    customPriceDay: 'Mar 16, 2027',
  },
  // No zone saved: every place uses UTC (the first visit would save the browser's zone, so the
  // browser here is UTC itself; the dates are the same stored days).
  {
    zone: null as string | null,
    offset: 0,
    browser: 'UTC',
    customPriceCreated: CUSTOM_PRICE_CREATED,
    customPriceDay: 'Mar 15, 2027',
  },
];
const MIDNIGHT_SIDES = [
  { label: '23:55', minutes: -5 },
  { label: '00:05', minutes: 5 },
];

const HYDRATION =
  /hydrat|did not match|text content does not match|Minified React error #(418|419|422|423|425)/i;

function watchRenderErrors(page: Page): string[] {
  const found: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') {
      if (HYDRATION.test(m.text())) found.push(m.text());
    }
  });
  page.on('pageerror', (e) => {
    if (HYDRATION.test(e.message)) found.push(e.message);
  });
  return found;
}

/** The innermost element holding both `a` and `b`: one item of a list, whatever its markup. */
function itemHolding(page: Page, a: Locator, b: Locator): Locator {
  const holding = page.locator('div').filter({ has: a }).filter({ has: b });
  return holding.filter({ hasNot: holding });
}

/** The preview's "Date:" / "Due:" line (label and day). */
function previewMeta(page: Page, label: 'Date:' | 'Due:'): Locator {
  return page
    .locator('p')
    .filter({ has: page.getByText(label, { exact: true }) });
}

async function editorDownloadText(page: Page): Promise<string> {
  const download = page.waitForEvent('download', { timeout: 90_000 });
  await page.getByRole('button', { name: 'Download PDF' }).click();
  return downloadedPdfText(await download);
}

for (const { zone, offset, browser: browserZone, customPriceCreated, customPriceDay } of ZONES) {
  for (const side of MIDNIGHT_SIDES) {
    test(`AC-08: zone ${zone ?? 'none saved'}, browser ${browserZone}, clock ${side.label}: every page shows the stored days`, async ({
      browser,
    }, testInfo) => {
      const f = await openSignedInFreelancer(browser, testInfo, 'eux-t19-dm', {
        seed: { timeZone: zone, customerName: CUSTOMER },
        context: {
          timezoneId: browserZone,
          viewport: { width: 1280, height: 800 },
        },
      });
      try {
        const { page, workspace } = f;
        const number = workspace.invoiceNumber;
        const otherNumber = number.replace(/-0001$/, '-0002');
        const prisma = createTestPrismaClient(readE2eRuntime().databaseUrl);
        try {
          const seeded = await prisma.invoice.update({
            where: { id: workspace.invoiceId },
            data: { issueDate: ISSUE, dueDate: DUE, status: 'PENDING' },
          });
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { id: _id, createdAt: _c, updatedAt: _u, ...copy } = seeded;
          await prisma.invoice.create({
            data: {
              ...copy,
              invoiceNumber: otherNumber,
              invoiceNumberKey: otherNumber.toLowerCase(),
              issueDate: OTHER_ISSUE,
              dueDate: OTHER_DUE,
            } as typeof copy,
          });
          // A custom price without a name shows its creation moment, in the Freelancer zone.
          await prisma.customPrice.create({
            data: {
              productId: workspace.productId,
              customerId: workspace.customerId,
              price: 80,
              createdAt: customPriceCreated,
            },
          });
        } finally {
          await prisma.$disconnect();
        }

        const midnight = Date.UTC(2027, 2, 15) - offset * 3_600_000;
        await setBrowserClock(page, new Date(midnight + side.minutes * 60_000));
        const errors = watchRenderErrors(page);

        // Invoices list
        await page.goto(`${APP_E2E_URL}${protectedRoutes.invoices}`);
        const listRow = page.getByRole('row').filter({ hasText: number });
        await expect(listRow).toContainText('Mar 15, 2027');
        await expect(listRow).toContainText('Mar 29, 2027');
        await expect(listRow).not.toContainText('Mar 2, 2027');
        const otherListRow = page.getByRole('row').filter({ hasText: otherNumber });
        await expect(otherListRow).toContainText('Mar 2, 2027');
        await expect(otherListRow).toContainText('Mar 9, 2027');
        await page.waitForLoadState('networkidle');

        // Dashboard: recent invoices and expected payments
        await page.goto(`${APP_E2E_URL}${protectedRoutes.dashboard}`);
        const recent = page.getByRole('row').filter({ hasText: number });
        await expect(recent).toContainText('Mar 15, 2027');
        await expect(recent).toContainText('Mar 29, 2027');
        await expect(recent).not.toContainText('Mar 2, 2027');
        await expect(
          page.getByText(`${CUSTOMER} • Due Mar 29`, { exact: true })
        ).toBeVisible();
        await page.waitForLoadState('networkidle');

        // A Customer's related invoices: each date is read inside its own invoice's item.
        await page.goto(
          `${APP_E2E_URL}${protectedRoutes.customerDetail(workspace.customerId)}`
        );
        const related = (n: string) =>
          itemHolding(
            page,
            page.getByRole('link', { name: n, exact: true }),
            page.getByRole('button', { name: `Actions for invoice ${n}`, exact: true })
          );
        await expect(related(number)).toContainText('Mar 15, 2027');
        await expect(related(number)).not.toContainText('Mar 2, 2027');
        await expect(related(otherNumber)).toContainText('Mar 2, 2027');
        await expect(related(otherNumber)).not.toContainText('Mar 15, 2027');
        await page.waitForLoadState('networkidle');

        // The editor, its preview and the PDF it downloads
        await page.goto(
          `${APP_E2E_URL}${protectedRoutes.invoiceEdit(workspace.invoiceId)}`
        );
        await expect(
          page.getByRole('button', { name: /^Issue Date\b/ })
        ).toContainText('March 15th, 2027');
        await expect(
          page.getByRole('button', { name: /^Due Date\b/ })
        ).toContainText('March 29th, 2027');
        await expect(previewMeta(page, 'Date:')).toHaveText('Date: Mar 15, 2027');
        await expect(previewMeta(page, 'Due:')).toHaveText('Due: Mar 29, 2027');
        await page.waitForLoadState('networkidle');
        const pdf = await editorDownloadText(page);
        expect(pdf).toContain('Date: Mar 15, 2027');
        expect(pdf).toContain('Due: Mar 29, 2027');

        // A custom price's creation moment, in the Freelancer zone (UTC when none is saved)
        await page.goto(
          `${APP_E2E_URL}${protectedRoutes.productCustomPrices(workspace.productId)}`
        );
        await expect(
          page.getByRole('row').filter({ hasText: CUSTOMER })
        ).toContainText(customPriceDay);
        await page.waitForLoadState('networkidle');

        expect(errors, 'render-mismatch / hydration console messages').toEqual(
          []
        );
      } finally {
        await f.context.close();
      }
    });
  }
}

// A new invoice's issue day is "today" in the Freelancer zone and its due day 30 days later, on the
// server and in the browser alike. The browser clock is put at 23:58 of the Freelancer's current
// day, in a browser zone whose own calendar day is a different one (UTC+14 and UTC-10 are 24 hours
// apart). The server reads the real clock; between the two Freelancer zones one of them always has a
// different day from UTC, so a server that ignored the zone fails at any hour.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** The Y/M/D the wall clock shows in `offsetHours` at `instant` (fixed-offset zones, no DST). */
function dayAt(instant: number, offsetHours: number): [number, number, number] {
  const shifted = new Date(instant + offsetHours * 3_600_000);
  return [shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()];
}

function ordinal(d: number): string {
  if (d % 100 >= 11 && d % 100 <= 13) return `${d}th`;
  return `${d}${['th', 'st', 'nd', 'rd'][d % 10] ?? 'th'}`;
}

function spelled([y, m, d]: [number, number, number]) {
  return { short: `${MONTHS[m]} ${d}, ${y}`, long: `${LONG_MONTHS[m]} ${ordinal(d)}, ${y}` };
}

const NEW_INVOICE_ZONES = [
  { zone: 'Pacific/Kiritimati', offset: 14, browser: 'Pacific/Honolulu', label: 'UTC+14' },
  { zone: 'Pacific/Honolulu', offset: -10, browser: 'Pacific/Kiritimati', label: 'UTC-10' },
];

for (const { zone, offset, browser: browserZone, label } of NEW_INVOICE_ZONES) {
  test(`AC-08: a new invoice opened at 23:58 in ${label}, browser ${browserZone}: today and the due date are the Freelancer's day`, async ({
    browser,
  }, testInfo) => {
    const f = await openSignedInFreelancer(browser, testInfo, 'eux-t34-new', {
      seed: { timeZone: zone, customerName: CUSTOMER },
      context: {
        timezoneId: browserZone,
        viewport: { width: 1280, height: 800 },
      },
    });
    try {
      const { page } = f;
      const [y, m, d] = dayAt(Date.now(), offset);
      // 23:58 on the Freelancer's current day; the browser's own zone is already on another day.
      await setBrowserClock(page, new Date(Date.UTC(y, m, d, 23, 58) - offset * 3_600_000));
      const errors = watchRenderErrors(page);

      // The server's day can roll over while the page loads; then the check is made again.
      let today = spelled([y, m, d]);
      let due = spelled(dayAt(Date.UTC(y, m, d + 30), 0));
      for (let attempt = 0; attempt < 2; attempt++) {
        const before = dayAt(Date.now(), offset).join('-');
        await page.goto(`${APP_E2E_URL}${protectedRoutes.invoicesNew}`);
        await expect(page.getByRole('button', { name: /^Issue Date\b/ })).not.toContainText('Pick a date');
        const after = dayAt(Date.now(), offset);
        if (before === after.join('-')) {
          today = spelled(after);
          due = spelled(dayAt(Date.UTC(after[0], after[1], after[2] + 30), 0));
          break;
        }
      }
      testInfo.annotations.push({ type: 'today', description: `${today.short} (due ${due.short})` });

      await expect(
        page.getByRole('button', { name: /^Issue Date\b/ })
      ).toHaveText(today.long);
      await expect(
        page.getByRole('button', { name: /^Due Date\b/ })
      ).toHaveText(due.long);
      await expect(previewMeta(page, 'Date:')).toHaveText(`Date: ${today.short}`);
      await expect(previewMeta(page, 'Due:')).toHaveText(`Due: ${due.short}`);
      await page.waitForLoadState('networkidle');
      // After hydration (and any client-side effect) the days are still the same.
      await expect(
        page.getByRole('button', { name: /^Issue Date\b/ })
      ).toHaveText(today.long);
      await expect(previewMeta(page, 'Date:')).toHaveText(`Date: ${today.short}`);

      expect(errors, 'render-mismatch / hydration console messages').toEqual([]);
    } finally {
      await f.context.close();
    }
  });
}
