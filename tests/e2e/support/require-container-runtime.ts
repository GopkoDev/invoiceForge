// Later e2e-through-UI tests need a throwaway database (test-plan.md §Test data: "E2E and
// e2e-through-UI runs use a fresh database per run"). Call this at the top of such a test/describe
// block: it skips locally with "skipped: no container runtime" (and fails when CI is set)
// instead of ever falling back to a real database.
import type { TestInfo } from '@playwright/test';
import { test } from '@playwright/test';
import { containerRuntimeDecision, isContainerRuntimeAvailable } from '../../support/db/docker-availability';

export async function skipWithoutContainerRuntime(testInfo: TestInfo): Promise<void> {
  const available = await isContainerRuntimeAvailable();
  const decision = containerRuntimeDecision({ ci: Boolean(process.env.CI), available });
  // In CI a missing runtime is a failure, never a silent skip (editor-ux T31, review S2).
  if (decision === 'fail') {
    throw new Error('no container runtime available in CI: the e2e suite cannot run');
  }
  test.skip(decision === 'skip', 'skipped: no container runtime');
  void testInfo;
}
