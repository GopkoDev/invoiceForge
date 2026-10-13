// editor-ux T19 (AC-11; spec §6 NFR "Accessibility"): an automated accessibility checker finds
// 0 serious or critical violations on the editor (new and existing invoice), the invoices list
// and the dashboard. Moderate and minor findings are reported as annotations, never failures.
import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { openSignedInFreelancer } from './support/signed-in';
import { createTestPrismaClient } from '../support/db/client';
import { createCustomer } from '../support/factories/customer';
import { readE2eRuntime } from './support/app-server';
import { openEditor } from './support/invoice-ui';
import { APP_E2E_URL } from './support/app-server';
import { protectedRoutes } from '../../config/routes.config';

test.describe.configure({ timeout: 120_000 });

/**
 * ai-chat-v2 review R16-4 / T46 (spec §6 Accessibility; screens.md SCR-02 «Greeting», >= 3:1 as large text): axe
 * reports gradient text as "incomplete", never as a pass, so the greeting accent's contrast is measured here: each
 * gradient stop, painted onto a canvas to get sRGB, against the nearest opaque background behind the heading.
 */
async function greetingAccentContrast(page: Page): Promise<number> {
  return page.evaluate(() => {
    const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
    const rgb = (css: string): [number, number, number, number] => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = '#000';
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      return [r, g, b, a];
    };
    const luminance = ([r, g, b]: number[]) => {
      const lin = (c: number) => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    };
    const accent = document.querySelector<HTMLElement>('[data-slot="greeting-accent"]')!;
    const stops = getComputedStyle(accent).backgroundImage.match(/(?:oklch|oklab|lab|lch|rgba?|hsla?|color)\([^()]*\)/g) ?? [];
    if (stops.length < 2) throw new Error(`no gradient stops in ${getComputedStyle(accent).backgroundImage}`);
    let el: HTMLElement | null = accent;
    let bg: [number, number, number, number] = [255, 255, 255, 255];
    while (el) {
      const c = rgb(getComputedStyle(el).backgroundColor);
      if (c[3] === 255) {
        bg = c;
        break;
      }
      el = el.parentElement;
    }
    const lb = luminance(bg);
    return Math.min(
      ...stops.map((stop) => {
        const lf = luminance(rgb(stop));
        return (Math.max(lf, lb) + 0.05) / (Math.min(lf, lb) + 0.05);
      })
    );
  });
}

async function expectNoSeriousViolations(
  page: Page,
  testInfo: TestInfo,
  where: string
): Promise<void> {
  // A fade or slide still running would be measured half-transparent (false contrast findings).
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity)
  );
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
    .analyze();
  const blocking = violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical'
  );
  for (const v of violations.filter((x) => !blocking.includes(x))) {
    testInfo.annotations.push({
      type: `axe-${v.impact ?? 'unknown'}`,
      description: `${where}: ${v.id} on ${v.nodes.length} node(s) - ${v.help}`,
    });
  }
  expect
    .soft(
      blocking.map(
        (v) =>
          `${v.impact} ${v.id} (${v.nodes.length}): ${v.help} -> ${v.nodes
            .slice(0, 3)
            .map((n) => `${n.target.join(' ')} ${n.html.slice(0, 160)}`)
            .join(' | ')}`
      ),
      `${where}: serious or critical accessibility violations`
    )
    .toEqual([]);
}

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'phone', width: 390, height: 844 },
] as const;

test.describe('AC-11: no serious or critical accessibility violations', () => {
  for (const vp of VIEWPORTS) {
    test(`the editor, new and existing invoice at ${vp.name} ${vp.width}x${vp.height}`, async ({
      browser,
    }, testInfo) => {
      const f = await openSignedInFreelancer(
        browser,
        testInfo,
        `eux-t26-axe-ed-${vp.name}`,
        {
          seed: { timeZone: 'UTC', status: 'DRAFT' },
          context: { viewport: { width: vp.width, height: vp.height } },
        }
      );
      try {
        const { page, workspace } = f;
        await page.goto(`${APP_E2E_URL}${protectedRoutes.invoicesNew}`);
        await expect(
          page.getByRole('textbox', { name: /^Invoice Number/ })
        ).toBeVisible();
        await page.waitForLoadState('networkidle');
        await expectNoSeriousViolations(
          page,
          testInfo,
          `new invoice editor (${vp.name})`
        );

        await openEditor(page, workspace.invoiceId);
        await expect(
          page.getByRole('textbox', { name: 'Quantity, line 1' })
        ).toBeVisible();
        await expectNoSeriousViolations(
          page,
          testInfo,
          `existing invoice editor (${vp.name})`
        );
      } finally {
        await f.context.close();
      }
    });
  }

  test('the editor with a refused save, at desktop and phone width', async ({
    browser,
  }, testInfo) => {
    for (const vp of VIEWPORTS) {
      const f = await openSignedInFreelancer(
        browser,
        testInfo,
        `eux-t26-axe-refused-${vp.name}`,
        {
          seed: { timeZone: 'UTC', status: 'DRAFT' },
          context: { viewport: { width: vp.width, height: vp.height } },
        }
      );
      try {
        const { page, workspace } = f;
        await openEditor(page, workspace.invoiceId);
        const quantity = page.getByRole('textbox', {
          name: 'Quantity, line 1',
        });
        await quantity.fill('0');
        await page.getByRole('button', { name: 'Save', exact: true }).click();
        const message = 'Quantity must be greater than zero.';
        await expect(page.getByText(message)).toBeVisible();
        await expect(quantity).toHaveAccessibleDescription(message);
        await expectNoSeriousViolations(
          page,
          testInfo,
          `refused save (${vp.name})`
        );
      } finally {
        await f.context.close();
      }
    }
  });

  test('the invoices list and the dashboard', async ({ browser }, testInfo) => {
    const f = await openSignedInFreelancer(
      browser,
      testInfo,
      'eux-t19-axe-ls',
      {
        seed: { timeZone: 'UTC' },
        context: { viewport: { width: 1280, height: 800 } },
      }
    );
    try {
      const { page, workspace } = f;
      await page.goto(`${APP_E2E_URL}${protectedRoutes.invoices}`);
      await expect(
        page.getByRole('row').filter({ hasText: workspace.invoiceNumber })
      ).toBeVisible();
      await expectNoSeriousViolations(page, testInfo, 'invoices list');

      await page.goto(`${APP_E2E_URL}${protectedRoutes.dashboard}`);
      await expect(
        page.getByText(workspace.invoiceNumber).first()
      ).toBeVisible();
      await page.waitForLoadState('networkidle');
      await expectNoSeriousViolations(page, testInfo, 'dashboard');
    } finally {
      await f.context.close();
    }
  });

  // ai-chat-v2 T31 (spec §6 NFR "Accessibility"): the AI section empty and with Offered choices, the preview panel
  // with the issue confirmation open, at desktop and phone width, and the dashboard AI block.
  for (const vp of VIEWPORTS) {
    test(`ai-chat-v2: the AI section, Offered choices, the preview with its dialog, and the dashboard AI block at ${vp.name}`, async ({
      browser,
    }, testInfo) => {
      testInfo.setTimeout(240_000);
      const f = await openSignedInFreelancer(browser, testInfo, `ai-v2-axe-${vp.name}`, {
        seed: { customerName: 'Acme Corp', timeZone: 'UTC' },
        context: { viewport: { width: 1280, height: 800 } },
      });
      try {
        const { page, workspace } = f;
        const prisma = createTestPrismaClient(readE2eRuntime().databaseUrl);
        try {
          await createCustomer(prisma, workspace.userId, { name: 'Acme GmbH' });
        } finally {
          await prisma.$disconnect();
        }
        await page.setViewportSize({ width: vp.width, height: vp.height });

        await page.goto(`${APP_E2E_URL}${protectedRoutes.ai}`);
        await expect(page.getByRole('heading', { name: /How can I help with your invoices today\?/ })).toBeVisible();
        await page.waitForLoadState('networkidle');
        await expectNoSeriousViolations(page, testInfo, `AI section, empty (${vp.name})`);
        expect(await greetingAccentContrast(page), 'greeting accent contrast, light').toBeGreaterThanOrEqual(3);
        // The same empty state in the dark theme (the app follows the system scheme by default).
        await page.emulateMedia({ colorScheme: 'dark' });
        await expect(page.locator('html')).toHaveClass(/(^|\s)dark(\s|$)/);
        await expectNoSeriousViolations(page, testInfo, `AI section, empty, dark (${vp.name})`);
        expect(await greetingAccentContrast(page), 'greeting accent contrast, dark').toBeGreaterThanOrEqual(3);
        await page.emulateMedia({ colorScheme: 'light' });
        await expect(page.locator('html')).not.toHaveClass(/(^|\s)dark(\s|$)/);

        await page.getByRole('textbox', { name: 'Message' }).fill('invoice Acme for 20 hours at $50');
        await page.getByRole('button', { name: 'Send', exact: true }).click();
        const choices = page.getByRole('group', { name: 'Choose a Customer' });
        await expect(choices.getByRole('button', { name: 'Acme Corp', exact: true })).toBeEnabled();
        await expectNoSeriousViolations(page, testInfo, `AI section, Offered choices (${vp.name})`);

        await choices.getByRole('button', { name: 'Acme Corp', exact: true }).click();
        await page.getByRole('button', { name: 'Create draft' }).click();
        await expect(page.getByText(/^Draft [A-Z0-9-]+ created\.$/)).toBeVisible();
        await page.getByRole('button', { name: 'Preview', exact: true }).click();
        const panel = page.locator('[data-slot="invoice-preview-panel"]');
        await panel.getByRole('button', { name: 'Issue invoice' }).click();
        await expect(page.getByRole('dialog', { name: /^Issue invoice / })).toBeVisible();
        await expectNoSeriousViolations(page, testInfo, `preview with the issue dialog (${vp.name})`);
        await page.getByRole('dialog', { name: /^Issue invoice / }).getByRole('button', { name: 'Cancel' }).click();

        await page.goto(`${APP_E2E_URL}${protectedRoutes.dashboard}`);
        await expect(page.locator('[data-slot="dashboard-ai-block"]').getByRole('list', { name: 'Recent conversations' })).toBeVisible();
        await page.waitForLoadState('networkidle');
        await expectNoSeriousViolations(page, testInfo, `dashboard AI block (${vp.name})`);
      } finally {
        await f.context.close();
      }
    });
  }
});
