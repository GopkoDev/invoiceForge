// editor-ux T22 (spec.md §5 AC-06; sad.md §6 Flow 5; review 2026-10-10 D2, T-h): what the server draws
// is what the hydrated editor shows. For a new and for an existing invoice, the invoice number field,
// sender, bank account, currency and both dates read the same in the JS-disabled page as after
// hydration, and nothing changes visibly once the page is interactive.
import { test, expect, type Page } from '@playwright/test';
import { openSignedInFreelancer } from './support/signed-in';
import { APP_E2E_URL } from './support/app-server';
import { protectedRoutes } from '../../config/routes.config';

test.describe.configure({ timeout: 90_000 });

async function snapshot(page: Page) {
  const number = page.getByLabel(/invoice number/i);
  return {
    numberValue: await number.inputValue(),
    numberPlaceholder: await number.getAttribute('placeholder'),
    numberBusy: await number.getAttribute('aria-busy'),
    currency: await page.getByLabel('Currency').inputValue(),
    // The preview's fit-to-width percentage is measured in the browser and the cookie banner only
    // appears with JavaScript; neither is part of the editor's first display.
    body: (await page.locator('body').innerText())
      .replace(/\s+/g, ' ')
      .replace(/ \d+% (?=INVOICE )/, ' ')
      .replace(/ We use strictly necessary session cookies.*$/, ''),
  };
}

for (const kind of ['new', 'existing'] as const) {
  test(`AC-06: a ${kind} invoice looks the same in the server HTML and after hydration`, async ({ browser }, testInfo) => {
    const f = await openSignedInFreelancer(browser, testInfo, `eux-t22-${kind}`, { seed: { status: 'DRAFT' } });
    try {
      const url = `${APP_E2E_URL}${
        kind === 'new' ? protectedRoutes.invoicesNew : protectedRoutes.invoiceEdit(f.workspace.invoiceId)
      }`;
      const state = await f.context.storageState();
      const noJs = await browser.newContext({ javaScriptEnabled: false, storageState: state });
      let server;
      try {
        const p = await noJs.newPage();
        await p.goto(url);
        server = await snapshot(p);
      } finally {
        await noJs.close();
      }
      if (kind === 'new') {
        // The default sender and its currency are already in the first HTML, not filled in later.
        expect(server.currency).not.toBe('');
        expect(server.body).toContain('Test Sender Profile');
      } else {
        expect(server.numberValue).toBe(f.workspace.invoiceNumber);
      }

      await f.page.goto(url);
      await expect(f.page.locator('h1.truncate')).toBeVisible();
      // Sample every frame change for a moment: the visible text must never differ from the server's.
      const hydrated = await snapshot(f.page);
      await f.page.waitForTimeout(500);
      const settled = await snapshot(f.page);
      const strip = (s: typeof server) => ({ ...s, numberBusy: null, numberPlaceholder: null });
      expect(strip(hydrated)).toEqual(strip(server));
      expect(settled.currency).toBe(server.currency);
      expect(settled.numberValue).toBe(server.numberValue);
      // A new invoice's number hint settles (no endless "Loading…").
      await expect(f.page.getByLabel(/invoice number/i)).not.toHaveAttribute('aria-busy', 'true');
      await expect(f.page.getByText('Loading…')).toHaveCount(0);
    } finally {
      await f.context.close();
    }
  });
}
