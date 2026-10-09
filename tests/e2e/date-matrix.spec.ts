// editor-ux T19 (AC-08; spec §6 NFR "Server/browser date agreement"; sad.md §10 QG-2): with the
// Freelancer zone at UTC-10, UTC and UTC+14, a browser in a different zone and the browser clock
// 5 minutes either side of the Freelancer's midnight, no page logs a hydration/render-mismatch
// error and every issue/due date shown is the stored calendar day. The server's own clock cannot
// be faked, so the stored days sit in the future and never depend on it.
import { test, expect as baseExpect, type Page } from '@playwright/test';
import { createTestPrismaClient } from '../support/db/client';
import { APP_E2E_URL, readE2eRuntime } from './support/app-server';
import { openSignedInFreelancer } from './support/signed-in';
import { setBrowserClock } from './support/browser-clock';
import { protectedRoutes } from '../../config/routes.config';
import { formatDay, formatMoment } from '../../lib/format';

test.describe.configure({ timeout: 240_000 });
const expect = baseExpect.configure({ timeout: 20_000 });

const ISSUE = new Date('2027-03-15T00:00:00Z');
const DUE = new Date('2027-03-29T00:00:00Z');
const CUSTOMER = 'Matrix Customer Ltd';

// Offset (hours) of each Freelancer zone on 2027-03-15 and a browser zone that differs from it.
const ZONES = [
  {
    zone: 'Pacific/Honolulu' as string | null,
    offset: -10,
    browser: 'Pacific/Kiritimati',
  },
  { zone: 'UTC' as string | null, offset: 0, browser: 'Pacific/Honolulu' },
  {
    zone: 'Pacific/Kiritimati' as string | null,
    offset: 14,
    browser: 'Pacific/Honolulu',
  },
  // No zone saved: every place uses UTC (the first visit would save the browser's zone, so the
  // browser here is UTC itself; the dates are the same stored days).
  { zone: null as string | null, offset: 0, browser: 'UTC' },
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

/** The editor shows the day long-form with an ordinal ("March 15th, 2027"). */
function editorDay(stored: Date): RegExp {
  const long = formatDay(stored, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const m = /^(\w+) (\d+), (\d+)$/.exec(long)!;
  return new RegExp(`${m[1]} ${m[2]}(?:st|nd|rd|th)?, ${m[3]}`);
}

for (const { zone, offset, browser: browserZone } of ZONES) {
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
        const prisma = createTestPrismaClient(readE2eRuntime().databaseUrl);
        try {
          await prisma.invoice.update({
            where: { id: workspace.invoiceId },
            data: { issueDate: ISSUE, dueDate: DUE, status: 'PENDING' },
          });
          // A custom price without a name shows its creation moment, in the Freelancer zone.
          await prisma.customPrice.create({
            data: {
              productId: workspace.productId,
              customerId: workspace.customerId,
              price: 80,
              createdAt: new Date('2027-03-15T23:30:00Z'),
            },
          });
        } finally {
          await prisma.$disconnect();
        }

        const midnight = Date.UTC(2027, 2, 15) - offset * 3_600_000;
        await setBrowserClock(page, new Date(midnight + side.minutes * 60_000));
        const errors = watchRenderErrors(page);

        const issue = formatDay(ISSUE);
        const due = formatDay(DUE);
        const number = workspace.invoiceNumber;

        // Invoices list
        await page.goto(`${APP_E2E_URL}${protectedRoutes.invoices}`);
        const listRow = page.getByRole('row').filter({ hasText: number });
        await expect(listRow).toContainText(issue);
        await expect(listRow).toContainText(due);
        await page.waitForLoadState('networkidle');

        // Dashboard: recent invoices and expected payments
        await page.goto(`${APP_E2E_URL}${protectedRoutes.dashboard}`);
        const recent = page.getByRole('row').filter({ hasText: number });
        await expect(recent).toContainText(issue);
        await expect(recent).toContainText(due);
        await expect(
          page.getByText(
            `${CUSTOMER} • Due ${formatDay(DUE, { month: 'short', day: 'numeric' })}`
          )
        ).toBeVisible();
        await page.waitForLoadState('networkidle');

        // A Customer's related invoices
        await page.goto(
          `${APP_E2E_URL}${protectedRoutes.customerDetail(workspace.customerId)}`
        );
        await expect(page.getByText(number).first()).toBeVisible();
        await expect(page.getByText(issue).first()).toBeVisible();
        await page.waitForLoadState('networkidle');

        // The editor
        await page.goto(
          `${APP_E2E_URL}${protectedRoutes.invoiceEdit(workspace.invoiceId)}`
        );
        await expect(
          page.getByRole('button', { name: /^Issue Date\b/ })
        ).toContainText(editorDay(ISSUE));
        await expect(
          page.getByRole('button', { name: /^Due Date\b/ })
        ).toContainText(editorDay(DUE));
        await page.waitForLoadState('networkidle');

        // A custom price's creation moment, in the Freelancer zone (UTC when none is saved)
        await page.goto(
          `${APP_E2E_URL}${protectedRoutes.productCustomPrices(workspace.productId)}`
        );
        await expect(
          page.getByText(formatMoment(new Date('2027-03-15T23:30:00Z'), zone))
        ).toBeVisible();
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
