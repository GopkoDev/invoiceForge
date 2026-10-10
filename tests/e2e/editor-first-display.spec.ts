// editor-ux T22 (spec.md §5 AC-06; sad.md §6 Flow 5; review 2026-10-10 D2, T-h): what the server draws
// is what the hydrated editor shows. For a new and for an existing invoice, the invoice number field,
// sender, bank account, currency and both dates read the same in the JS-disabled page as after
// hydration, and nothing changes visibly once the page is interactive. (T43, review r2 T-j: the
// second snapshot waits for a real hydration signal, compares the whole settled page and fails on
// any hydration / render-mismatch console error.)
import { test, expect, type Page } from '@playwright/test';
import { openSignedInFreelancer } from './support/signed-in';
import { APP_E2E_URL } from './support/app-server';
import { protectedRoutes } from '../../config/routes.config';

test.describe.configure({ timeout: 90_000 });


// Same pattern as date-matrix.spec.ts's watchRenderErrors: React's hydration / text-mismatch warnings.
const HYDRATION =
  /hydrat|did not match|text content does not match|Minified React error #(418|419|422|423|425)/i;

function watchRenderErrors(page: Page): string[] {
  const found: string[] = [];
  page.on('console', (m) => {
    if ((m.type() === 'error' || m.type() === 'warning') && HYDRATION.test(m.text())) {
      found.push(m.text());
    }
  });
  page.on('pageerror', (e) => {
    if (HYDRATION.test(e.message)) found.push(e.message);
  });
  return found;
}

/**
 * Resolves once React has hydrated the editor. React attaches its fiber to a DOM node only when it
 * hydrates (or renders) that node, so a `__reactFiber$…` key on the invoice number and currency
 * inputs exists only after the client took them over; the server-rendered node never has one.
 */
async function waitForHydration(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const hydrated = (el: Element | null) =>
      !!el && Object.keys(el).some((k) => k.startsWith('__reactFiber$'));
    const inputs = [...document.querySelectorAll('input')];
    const byLabel = (re: RegExp) => {
      const label = [...document.querySelectorAll('label')].find((l) => re.test(l.textContent ?? ''));
      return label?.htmlFor ? document.getElementById(label.htmlFor) : null;
    };
    return (
      inputs.length > 0 &&
      hydrated(byLabel(/invoice number/i)) &&
      hydrated(byLabel(/^Currency$/)) &&
      hydrated(document.querySelector('h1.truncate'))
    );
  });
}

async function snapshot(page: Page) {
  const number = page.getByLabel(/invoice number/i);
  return {
    numberValue: await number.inputValue(),
    currency: await page.getByLabel('Currency').inputValue(),
    // Every field's value, in document order: dates, sender, bank account, lines, notes.
    fields: await page.evaluate(() =>
      [...document.querySelectorAll('input, textarea, select')]
        .filter((el) => (el as HTMLInputElement).type !== 'hidden')
        .map((el) => `${el.tagName.toLowerCase()}:${(el as HTMLInputElement).value}`)
    ),
    // The whole page text. Masked: the number field's note ("Loading…" while the hint is on its way,
    // "Assigned on save" after) is the one legitimately changing text; the preview's fit-to-width
    // percentage is measured in the browser and the cookie banner only appears with JavaScript.
    body: (await page.locator('body').innerText())
      .replace(/\s+/g, ' ')
      .replace(/Loading…|Assigned on save/g, '<number note>')
      // The seeded logo is a data: URL, which the browser-side logo fetch refuses with a notice
      // above the preview; like the percentage it appears only with JavaScript.
      .replace(/ The logo [^.]*\. The PDF was made without it\./, '')
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
        // The no-JS page really is un-hydrated (so the signal below proves something).
        expect(server.body).toContain(kind === 'new' ? '<number note>' : f.workspace.invoiceNumber);
      } finally {
        await noJs.close();
      }
      if (kind === 'new') {
        // The default sender and its currency are already in the first HTML, not filled in later.
        expect(server.currency).not.toBe('');
        expect(server.body).toContain('Test Sender Profile');
      } else {
        expect(server.numberValue).toBe(f.workspace.invoiceNumber);
        expect(server.body).toContain('Test Item');
      }

      const errors = watchRenderErrors(f.page);
      await f.page.goto(url);
      await waitForHydration(f.page);
      // The moment the client has taken over: nothing has changed yet.
      expect(await snapshot(f.page), 'at hydration').toEqual(server);

      // A new invoice's number hint settles (no endless "Loading…"), then the whole page is compared again.
      await expect(f.page.getByLabel(/invoice number/i)).not.toHaveAttribute('aria-busy', 'true');
      await expect(f.page.getByText('Loading…')).toHaveCount(0);
      await f.page.waitForLoadState('networkidle');
      expect(await snapshot(f.page), 'once settled').toEqual(server);
      expect(errors, 'hydration / render-mismatch errors').toEqual([]);
    } finally {
      await f.context.close();
    }
  });
}
