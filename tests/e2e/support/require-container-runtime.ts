// Later e2e-through-UI tests need a throwaway database (test-plan.md §Test data: "E2E and
// e2e-through-UI runs use a fresh database per run"). Call this at the top of such a test/describe
// block: it skips cleanly with "skipped: no container runtime" instead of failing or ever
// falling back to a real database.
import type { TestInfo } from '@playwright/test';
import { test } from '@playwright/test';
import { isContainerRuntimeAvailable } from '../../support/db/docker-availability';

export async function skipWithoutContainerRuntime(testInfo: TestInfo): Promise<void> {
  const available = await isContainerRuntimeAvailable();
  test.skip(!available, 'skipped: no container runtime');
  void testInfo;
}
