// Global Vitest setup for the unit/component/contract run. Extends `expect` with jest-dom
// matchers for component tests; a no-op cost for unit/contract tests.
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// `@testing-library/react`'s own auto-cleanup only registers itself when it finds a
// global `afterEach` (i.e. Vitest's `test.globals: true`), which this project does not
// set. Without an explicit unmount, DOM from one component test's `render()` leaks into
// the next test in the same file. A no-op for unit/contract tests (they never call
// `render()`, so there is nothing to clean up).
afterEach(() => {
  cleanup();
});
