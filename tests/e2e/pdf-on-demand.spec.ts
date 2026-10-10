// editor-ux T3 (test-plan.md AC-01, AC-02, AC-02b e2e-through-UI rows; spec §6 "First PDF after
// page load"): the PDF toolkit is fetched on the first Download, once per visit, and its failures
// are told in plain language. A toolkit chunk is recognised by its body, not by a file name.
import { test, expect, type Page } from '@playwright/test';
import { APP_E2E_URL } from './support/app-server';
import { openSignedInFreelancer } from './support/signed-in';
import { chooseRowAction, openInvoiceList } from './support/invoice-ui';
import { downloadedPdfText } from './support/pdf-download-text';
import { protectedRoutes } from '../../config/routes.config';
import { PDF_TOOLKIT_MARKERS } from '../../scripts/check-pdf-chunks';

test.describe.configure({ timeout: 240_000 });

const CHUNK = /\/_next\/static\/chunks\/.+\.js/;
const isChunk = (url: string) => CHUNK.test(url);

/** URLs of every script chunk served to the page whose body holds the PDF toolkit. */
function trackToolkitChunks(page: Page): string[] {
  const urls: string[] = [];
  page.on('response', async (r) => {
    if (!isChunk(r.url()) || r.status() !== 200) return;
    const body = await r.text().catch(() => '');
    if (PDF_TOOLKIT_MARKERS.some((m) => body.includes(m))) urls.push(r.url());
  });
  return urls;
}

/** Lets every response handler already queued (each reads its body) run to completion. */
async function settleResponseHandlers(page: Page) {
  await page.evaluate(() => new Promise((r) => setTimeout(r, 500)));
  await page.waitForLoadState('networkidle');
}

test('AC-01: pages open without the toolkit; the first Download fetches it, later actions reuse it', async ({
  browser,
}, testInfo) => {
  const f = await openSignedInFreelancer(browser, testInfo, 'eux-pdf-first');
  try {
    const { page, workspace } = f;
    const fetched = trackToolkitChunks(page);
    const pages = [
      protectedRoutes.dashboard,
      protectedRoutes.invoices,
      protectedRoutes.customers,
      protectedRoutes.products,
      protectedRoutes.senderProfiles,
      protectedRoutes.customerDetail(workspace.customerId),
      protectedRoutes.senderProfileDetail(workspace.senderProfileId),
    ];
    for (const route of pages) {
      await page.goto(`${APP_E2E_URL}${route}`);
      await page.waitForLoadState('networkidle');
    }
    expect(fetched, 'no page but the editor fetches the toolkit when it opens').toEqual([]);

    await openInvoiceList(page);
    await page.waitForLoadState('networkidle');
    expect(fetched).toEqual([]);

    const download = page.waitForEvent('download');
    await chooseRowAction(page, workspace.invoiceNumber, 'Download PDF');
    expect(await downloadedPdfText(await download)).toContain(workspace.invoiceNumber);
    const afterFirst = fetched.length;
    expect(afterFirst).toBeGreaterThan(0);

    const second = page.waitForEvent('download');
    await chooseRowAction(page, workspace.invoiceNumber, 'Download PDF');
    await second;
    expect(fetched.length, 'a later Download does not fetch the toolkit again').toBe(afterFirst);
  } finally {
    await f.context.close();
  }
});

test('AC-01: opening the invoice preview first fetches no toolkit chunk, and shows the invoice', async ({
  browser,
}, testInfo) => {
  const f = await openSignedInFreelancer(browser, testInfo, 'eux-pdf-preview-first');
  try {
    const { page, workspace } = f;
    const fetched = trackToolkitChunks(page);
    await openInvoiceList(page);
    await page.waitForLoadState('networkidle');

    await chooseRowAction(page, workspace.invoiceNumber, 'View Document');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(workspace.invoiceNumber);
    await page.waitForLoadState('networkidle');
    await settleResponseHandlers(page);
    expect(fetched, 'the preview alone never fetches the PDF toolkit').toEqual([]);
  } finally {
    await f.context.close();
  }
});

test('AC-01: after the first Download, a later Print and the preview fetch no new toolkit chunk', async ({
  browser,
}, testInfo) => {
  const f = await openSignedInFreelancer(browser, testInfo, 'eux-pdf-reuse');
  try {
    const { page, workspace } = f;
    const fetched = trackToolkitChunks(page);
    await openInvoiceList(page);
    await page.waitForLoadState('networkidle');

    const download = page.waitForEvent('download');
    await chooseRowAction(page, workspace.invoiceNumber, 'Download PDF');
    await download;
    const afterFirst = fetched.length;
    expect(afterFirst).toBeGreaterThan(0);

    // Headless Chromium turns a navigation to a PDF blob into an aborted load, so the popup URL
    // cannot show the print finished; the PDF blob handed to the print window can.
    await page.evaluate(() => {
      const w = window as unknown as { __pdfBlobs: string[] };
      w.__pdfBlobs = [];
      const create = URL.createObjectURL.bind(URL);
      URL.createObjectURL = (obj: Blob | MediaSource) => {
        const url = create(obj);
        if (obj instanceof Blob && obj.type === 'application/pdf') w.__pdfBlobs.push(url);
        return url;
      };
    });
    const popup = page.waitForEvent('popup');
    await chooseRowAction(page, workspace.invoiceNumber, 'Print');
    await popup;
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __pdfBlobs: string[] }).__pdfBlobs.length), {
        timeout: 30_000,
        message: 'the print generated its PDF and handed it to the print window',
      })
      .toBe(1);
    await page.waitForLoadState('networkidle');
    await settleResponseHandlers(page);
    expect(fetched.length, 'a later Print does not fetch the toolkit again').toBe(afterFirst);

    await chooseRowAction(page, workspace.invoiceNumber, 'View Document');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.waitForLoadState('networkidle');
    await settleResponseHandlers(page);
    expect(fetched.length, 'the preview does not fetch the toolkit again').toBe(afterFirst);
  } finally {
    await f.context.close();
  }
});

test('AC-02: with the connection dropped Download offers to try again, and trying again works', async ({
  browser,
}, testInfo) => {
  const f = await openSignedInFreelancer(browser, testInfo, 'eux-pdf-offline');
  try {
    const { page, workspace } = f;
    await openInvoiceList(page);
    await page.waitForLoadState('networkidle');
    await page.route(CHUNK, (route) => route.abort('internetdisconnected'));
    await page.route(`${APP_E2E_URL}/`, (route) => route.abort('internetdisconnected'));
    await chooseRowAction(page, workspace.invoiceNumber, 'Download PDF');
    await expect(page.getByText('The PDF could not be prepared.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: workspace.invoiceNumber })).toBeVisible();

    await page.unroute(CHUNK);
    await page.unroute(`${APP_E2E_URL}/`);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Try again' }).click();
    expect(await downloadedPdfText(await download)).toContain(workspace.invoiceNumber);
  } finally {
    await f.context.close();
  }
});

test('AC-02b: a toolkit chunk gone after a release shows the newer-version message, and Reload recovers', async ({
  browser,
}, testInfo) => {
  const f = await openSignedInFreelancer(browser, testInfo, 'eux-pdf-newversion');
  try {
    const { page, workspace } = f;
    await openInvoiceList(page);
    await page.waitForLoadState('networkidle');
    // The origin stays reachable; every script chunk not already loaded answers 404.
    await page.route(CHUNK, (route) => route.fulfill({ status: 404, body: 'gone' }));
    await chooseRowAction(page, workspace.invoiceNumber, 'Download PDF');
    await expect(page.getByText(/newer version/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reload' })).toBeVisible();
    await expect(page.getByText('The PDF could not be prepared.')).toHaveCount(0);

    await page.unroute(CHUNK);
    await page.getByRole('button', { name: 'Reload' }).click();
    await page.waitForLoadState('networkidle');
    const download = page.waitForEvent('download');
    await chooseRowAction(page, workspace.invoiceNumber, 'Download PDF');
    expect(await downloadedPdfText(await download)).toContain(workspace.invoiceNumber);
  } finally {
    await f.context.close();
  }
});

// Spec §6 / sad QG-3: 20 fresh opens at 10 Mbit/s, p95 of click -> download <= 3 s. Slow, so it
// runs before each wave and nightly (E2E_TIMING=1), not on every PR.
test.describe('first PDF timing', () => {
  test.skip(process.env.E2E_TIMING !== '1', 'timing run: set E2E_TIMING=1');
  test.describe.configure({ timeout: 900_000 });

  test('p95 of Download click to file, 20 runs at 10 Mbit/s, is within 3 s', async ({
    browser,
  }, testInfo) => {
    const f = await openSignedInFreelancer(browser, testInfo, 'eux-pdf-timing');
    try {
      const { page, workspace } = f;
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 20,
        downloadThroughput: (10 * 1024 * 1024) / 8,
        uploadThroughput: (10 * 1024 * 1024) / 8,
      });
      const samples: number[] = [];
      for (let run = 0; run < 20; run++) {
        await cdp.send('Network.clearBrowserCache');
        await openInvoiceList(page);
        await page.waitForLoadState('networkidle');
        const menu = page
          .getByRole('row')
          .filter({ hasText: workspace.invoiceNumber })
          .getByRole('button', { name: `Actions for ${workspace.invoiceNumber}` });
        await menu.click();
        const item = page.getByRole('menuitem', { name: 'Download PDF' });
        const download = page.waitForEvent('download');
        const start = Date.now();
        await item.click();
        await download;
        samples.push(Date.now() - start);
      }
      samples.sort((a, b) => a - b);
      const p95 = samples[Math.ceil(samples.length * 0.95) - 1];
      testInfo.annotations.push({ type: 'p95-ms', description: String(p95) });
      expect(p95).toBeLessThanOrEqual(3000);
    } finally {
      await f.context.close();
    }
  });
});
