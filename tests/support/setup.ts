// Global Vitest setup for the unit/component/contract run. Extends `expect` with jest-dom
// matchers for component tests; a no-op cost for unit/contract tests.
import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// `@testing-library/react`'s own auto-cleanup only registers itself when it finds a
// global `afterEach` (i.e. Vitest's `test.globals: true`), which this project does not
// set. Without an explicit unmount, DOM from one component test's `render()` leaks into
// the next test in the same file. A no-op for unit/contract tests (they never call
// `render()`, so there is nothing to clean up).
afterEach(() => {
  cleanup();
});

// `server-only` throws outside the Next.js server bundle. lib/services files (and the modules that
// re-export them) import it by design (service-layer ADR-0002), so neutralise it for every test.
vi.mock('server-only', () => ({}));
