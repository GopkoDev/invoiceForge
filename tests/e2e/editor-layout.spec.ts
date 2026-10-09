// editor-ux T17 (test-plan.md AC-13 / AC-14 rows; ADR-0004): the editor renders its phone and
// desktop layouts from one DOM tree switched by CSS, so the server's HTML at 390 px is already the
// phone layout and a width change keeps the typed text and focus.
// Visual baselines (toHaveScreenshot) are recorded on the first green run:
//   pnpm exec playwright test tests/e2e/editor-layout.spec.ts --project=chromium --update-snapshots
import { test, expect } from '@playwright/test';
import { openSignedInFreelancer } from './support/signed-in';
import { openEditor } from './support/invoice-ui';
import { APP_E2E_URL } from './support/app-server';
import { protectedRoutes } from '../../config/routes.config';

test.describe.configure({ timeout: 90_000 });

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

test('AC-13: the server HTML at 390 px is the phone layout, from one tree', async ({
  browser,
}, testInfo) => {
  const f = await openSignedInFreelancer(browser, testInfo, 'eux-t17-ssr', {
    seed: { status: 'DRAFT' },
    context: { viewport: PHONE },
  });
  try {
    const { page, context, workspace } = f;
    const url = `${APP_E2E_URL}${protectedRoutes.invoiceEdit(workspace.invoiceId)}`;

    // Raw server HTML: each line field is rendered once, not once per layout.
    const html = await (await context.request.get(url)).text();
    expect(html.match(/Quantity, line 1/g) ?? []).toHaveLength(1);

    // JS disabled: what the server drew is already the phone layout.
    const state = await context.storageState();
    const noJs = await browser.newContext({
      viewport: PHONE,
      javaScriptEnabled: false,
      storageState: state,
    });
    try {
      const p = await noJs.newPage();
      await p.goto(url);
      await expect(p.getByRole('textbox', { name: 'Quantity, line 1' })).toBeVisible();
      // The desktop-only resize handle is hidden at 390 px.
      await expect(p.getByRole('separator')).toHaveCount(0);
    } finally {
      await noJs.close();
    }
    void page;
  } finally {
    await f.context.close();
  }
});

test('AC-14: «12.» in a focused line field survives a breakpoint resize both ways', async ({
  browser,
}, testInfo) => {
  const f = await openSignedInFreelancer(browser, testInfo, 'eux-t17-resize', {
    seed: { status: 'DRAFT' },
    context: { viewport: DESKTOP },
  });
  try {
    const { page, workspace } = f;
    await openEditor(page, workspace.invoiceId);

    // One DOM tree: exactly one input per line field.
    const quantity = page.getByRole('textbox', { name: 'Quantity, line 1' });
    await expect(quantity).toHaveCount(1);

    await quantity.click();
    await quantity.fill('12.');
    await expect(quantity).toBeFocused();

    for (const size of [PHONE, { width: 1024, height: 768 }, PHONE, DESKTOP]) {
      await page.setViewportSize(size);
      await expect(quantity).toHaveValue('12.');
      await expect(quantity).toBeFocused();
      expect(
        await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))
      ).toBe('Quantity, line 1');
    }
  } finally {
    await f.context.close();
  }
});

test('AC-13: desktop and phone editor match their baselines', async ({
  browser,
}, testInfo) => {
  const f = await openSignedInFreelancer(browser, testInfo, 'eux-t17-visual', {
    seed: { status: 'DRAFT' },
    context: { viewport: DESKTOP },
  });
  try {
    const { page, workspace } = f;
    await openEditor(page, workspace.invoiceId);
    await expect(page).toHaveScreenshot('editor-desktop.png', { maxDiffPixelRatio: 0.02 });
    await page.setViewportSize(PHONE);
    await expect(page).toHaveScreenshot('editor-phone.png', { maxDiffPixelRatio: 0.02 });
  } finally {
    await f.context.close();
  }
});
