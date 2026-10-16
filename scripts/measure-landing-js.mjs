// Records the landing page's first-load compressed JS into tests/e2e/support/landing-js-baseline.json.
// Runs the @baseline Playwright test against the production build that the e2e harness boots
// (tests/e2e/support/start-app-server.mjs, needs Docker). Never measures a dev server.
import { spawnSync } from 'node:child_process';

const res = spawnSync(
  'pnpm',
  ['exec', 'playwright', 'test', 'tests/e2e/landing-js-baseline.spec.ts', '--project=chromium', '--grep', '@baseline', '--workers=1'],
  { stdio: 'inherit', env: { ...process.env, MEASURE_LANDING_JS: '1' } }
);
process.exit(res.status ?? 1);
