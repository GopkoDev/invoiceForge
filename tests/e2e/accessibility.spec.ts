// editor-ux T19 (AC-11; spec §6 NFR "Accessibility"): an automated accessibility checker finds
// 0 serious or critical violations on the editor (new and existing invoice), the invoices list
// and the dashboard. Moderate and minor findings are reported as annotations, never failures.
import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { openSignedInFreelancer } from './support/signed-in';
import { openEditor } from './support/invoice-ui';
import { APP_E2E_URL } from './support/app-server';
import { protectedRoutes } from '../../config/routes.config';

test.describe.configure({ timeout: 120_000 });

async function expectNoSeriousViolations(
  page: Page,
  testInfo: TestInfo,
  where: string
): Promise<void> {
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
});
