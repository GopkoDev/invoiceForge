import { test, expect } from '@playwright/test';
import { skipWithoutContainerRuntime } from './support/require-container-runtime';

test.describe('e2e harness smoke', () => {
  test('a browser can load a page served by the harness', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('e2e harness smoke');
    await expect(page.locator('h1')).toHaveText('ok');
  });

  test('DB-backed e2e tests skip cleanly without a container runtime', async ({}, testInfo) => {
    // Demonstrates the skip contract later e2e-through-UI tests use (test-plan.md: "E2E and
    // e2e-through-UI runs use a fresh database per run"). This test itself needs no database.
    await skipWithoutContainerRuntime(testInfo);
    // If we get here, Docker answered - a real DB-backed e2e test would start its container now.
    expect(true).toBe(true);
  });
});
