import { defineConfig } from '@playwright/test';
import { APP_E2E_PORT, APP_E2E_URL } from './tests/e2e/support/app-server';

const PORT = 4310;
// F-12 (T34, AC-05): a second, real app server for the no-cookie route sweep — the harness smoke
// test above still runs against the plain static page; only tests/e2e/route-sweep.spec.ts talks
// to this one (by full URL, not `use.baseURL`, since that stays pointed at the static server).
const APP_PORT = APP_E2E_PORT;

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: `node tests/e2e/support/static-server.mjs`,
      url: `http://127.0.0.1:${PORT}`,
      reuseExistingServer: !process.env.CI,
      env: { PORT: String(PORT) },
      timeout: 30_000,
    },
    {
      // Production build against a throwaway Postgres container (test-plan.md "E2E" row).
      // Builds and boots the real app itself — see the script's own comment for the no-docker
      // fallback that keeps this from blocking the rest of the e2e suite.
      command: `node tests/e2e/support/start-app-server.mjs`,
      url: APP_E2E_URL,
      reuseExistingServer: !process.env.CI,
      env: { APP_E2E_PORT: String(APP_PORT) },
      timeout: 300_000,
    },
  ],
});
