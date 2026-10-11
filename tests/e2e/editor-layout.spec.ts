// editor-ux T17 (test-plan.md AC-13 / AC-14 rows; ADR-0004): the editor renders its phone and
// desktop layouts from one DOM tree switched by CSS, so the server's HTML at 390 px is already the
// phone layout and a width change keeps the typed text and focus.
//
// Visual baselines (toHaveScreenshot) are Linux-only and authoritative: they are captured with the
// official Playwright image that matches @playwright/test, because font rendering differs between
// operating systems. See tests/e2e/README.md ("Layout baselines") for the capture command. Local
// macOS runs skip the screenshot comparison unless PW_SNAPSHOT_PLATFORM=linux; the structure checks run everywhere.
import { test, expect, type Page } from '@playwright/test';
import { openSignedInFreelancer } from './support/signed-in';
import { openEditor } from './support/invoice-ui';
import {
  APP_E2E_URL,
  SNAPSHOT_PLATFORM,
} from './support/app-server';
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
      await expect(
        p.getByRole('textbox', { name: 'Quantity, line 1' })
      ).toBeVisible();
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
    const lines = page.getByRole('textbox', { name: /^Quantity, line \d+$/ });
    const lineCount = await lines.count();
    expect(lineCount).toBeGreaterThan(0);

    // A draft in another field, so the check covers more than the focused one.
    const notes = page.getByRole('textbox', { name: 'Notes' });
    await notes.fill('Draft note, kept across widths');

    await quantity.click();
    await quantity.fill('12.');
    await expect(quantity).toBeFocused();

    for (const size of [PHONE, { width: 1024, height: 768 }, PHONE, DESKTOP]) {
      await page.setViewportSize(size);
      await expect(quantity).toHaveValue('12.');
      await expect(quantity).toBeFocused();
      await expect(lines).toHaveCount(lineCount);
      await expect(notes).toHaveValue('Draft note, kept across widths');
      expect(
        await page.evaluate(() =>
          document.activeElement?.getAttribute('aria-label')
        )
      ).toBe('Quantity, line 1');
    }
  } finally {
    await f.context.close();
  }
});

/**
 * A serialized outline of the editor's structure: every landmark, heading, form control, button
 * and separator with its tag, role, accessible name and whether it is drawn at this width. Text
 * values are left out on purpose (random numbers, dates), so the outline is stable per layout.
 */
async function layoutOutline(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const selector =
      'header, main, nav, aside, section, form, h1, h2, h3, input, textarea, select, button, table, [role]';
    return (
      Array.from(document.querySelectorAll(selector))
        // Left out: the live regions that hydration adds and the cookie banner (client-only, fixed
        // to the bottom edge). They are not part of the editor's layout.
        .filter(
          (el) =>
            !el.closest(
              '[role="alert"], [role="status"], .fixed.right-0.bottom-0.left-0'
            )
        )
        .map((el) => {
          const shown = (el as HTMLElement).checkVisibility({
            checkVisibilityCSS: true,
          });
          const label = el.getAttribute('aria-label') ?? '';
          const role = el.getAttribute('role') ?? '';
          return `${el.tagName.toLowerCase()}|${role}|${label}|${shown ? 'shown' : 'hidden'}`;
        })
    );
  });
}

const EDITOR_ROUTES = [
  ['an existing invoice', (id: string) => protectedRoutes.invoiceEdit(id)],
  ['a new invoice', () => protectedRoutes.invoicesNew],
] as const;

for (const [label, route] of EDITOR_ROUTES) {
  for (const [size, viewport] of [
    ['phone', PHONE],
    ['desktop', DESKTOP],
  ] as const) {
    test(`AC-13: ${label} at ${size} width has the same structure before and after hydration`, async ({
      browser,
    }, testInfo) => {
      const f = await openSignedInFreelancer(
        browser,
        testInfo,
        `eux-t32-struct-${size}`,
        {
          seed: { status: 'DRAFT' },
          context: { viewport },
        }
      );
      try {
        const { context, workspace } = f;
        const url = `${APP_E2E_URL}${route(workspace.invoiceId)}`;

        // Server HTML only: no script runs, so nothing but the server's markup is outlined.
        const noJs = await browser.newContext({
          viewport,
          javaScriptEnabled: false,
          storageState: await context.storageState(),
        });
        let before: string[];
        try {
          const p = await noJs.newPage();
          await p.goto(url);
          await expect(p.locator('h1').first()).toBeVisible();
          before = await layoutOutline(p);
        } finally {
          await noJs.close();
        }

        // Hydrated: wait until the page has finished loading its client code.
        const page = f.page;
        await page.goto(url);
        await expect(page.locator('h1').first()).toBeVisible();
        await page.waitForLoadState('networkidle');
        const after = await layoutOutline(page);

        expect(before.length).toBeGreaterThan(20);
        expect(after).toEqual(before);
        // The two layouts differ: the side-by-side preview (its zoom control) is drawn only on desktop.
        expect(after).toContain(
          `button||Zoom out|${size === 'desktop' ? 'shown' : 'hidden'}`
        );
      } finally {
        await f.context.close();
      }
    });
  }
}

for (const [label, route] of EDITOR_ROUTES) {
  test(`AC-13: desktop and phone editor match their baselines for ${label}`, async ({
    browser,
  }, testInfo) => {
    test.skip(
      SNAPSHOT_PLATFORM !== 'linux',
      'Baselines are Linux-only (CI image); see tests/e2e/README.md'
    );
    const slug = label.replace(/^an? /, '').replace(' ', '-');
    const f = await openSignedInFreelancer(
      browser,
      testInfo,
      `eux-t17-visual-${slug}`,
      {
        seed: { status: 'DRAFT' },
        context: { viewport: DESKTOP },
      }
    );
    try {
      const { page, workspace } = f;
      await page.goto(`${APP_E2E_URL}${route(workspace.invoiceId)}`);
      await expect(page.locator('h1').first()).toBeVisible();
      await page.waitForLoadState('networkidle');
      // Covered, so only the layout is compared: the random invoice number (form field, title and
      // its badge), both dates, the random e-mail addresses, and inside the preview's page only
      // its dynamic text (the header with the number and dates, and the sender / bill-to blocks).
      // The preview's frame, zoom bar, table, totals and notes stay in the picture (editor-ux T46,
      // review Q7). A new invoice opens with the default sender and bank filled in (T22), which is
      // the screen users see, so the baseline is taken that way.
      const previewPage = page.locator(
        'div.relative.min-h-0.flex-1.overflow-auto.overscroll-contain div.relative.p-10.text-sm'
      );
      const volatile = [
        page
          .locator('div.space-y-2')
          .filter({ hasText: 'Invoice Number' })
          .locator('input'),
        page.getByRole('button', { name: /Issue Date/ }),
        page.getByRole('button', { name: /Due Date/ }),
        page.locator('h1.truncate').locator('..'),
        page.getByText(/@example\.test/),
        previewPage.locator(
          ':scope > div.mb-8.justify-between, :scope > div.mb-8.grid'
        ),
      ];
      const shot = {
        maxDiffPixelRatio: 0.002,
        animations: 'disabled' as const,
        mask: volatile,
      };
      await expect(page).toHaveScreenshot(`editor-${slug}-desktop.png`, shot);
      await page.setViewportSize(PHONE);
      await expect(page).toHaveScreenshot(`editor-${slug}-phone.png`, shot);
    } finally {
      await f.context.close();
    }
  });
}
