import { defineConfig, devices } from '@playwright/test';
import {
  APP_E2E_PORT,
  APP_E2E_URL,
  BASE_URL_OVERRIDE,
  SNAPSHOT_PLATFORM,
} from './tests/e2e/support/app-server';

const PORT = 4310;
// F-12 (T34, AC-05): a second, real app server for the no-cookie route sweep — the harness smoke
// test above still runs against the plain static page; only tests/e2e/route-sweep.spec.ts talks
// to this one (by full URL, not `use.baseURL`, since that stays pointed at the static server).
const APP_PORT = APP_E2E_PORT;

// With BASE_URL set (a preview deploy) no local server is started; the real-app specs use it
// as their origin. Local runs stay the default.
export default defineConfig({
  testDir: './tests/e2e',
  // Baselines are named by the OS that drew them; see SNAPSHOT_PLATFORM.
  snapshotPathTemplate: `{testDir}/{testFileDir}/{testFileName}-snapshots/{arg}{-projectName}-${SNAPSHOT_PLATFORM}{ext}`,
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  // T53 (review r3 R3): on CI (and with CI=1, as the README runs it) two workers, so the plain
  // `pnpm test:e2e` is the command that passes and every machine runs the same load. Local runs
  // keep Playwright's default (half the CPUs). This is a guard; the races it once hid are fixed.
  workers: process.env.CI ? 2 : undefined,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL_OVERRIDE ?? `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  // AC-07 (T15): the session-isolation proof runs in Chromium and WebKit (Safari's back/forward
  // cache behaves differently from Chromium's).
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // WebKit runs only the session-isolation proof and the first-navigation-after-sign-in proof
      // (T57: WebKit is the browser that cancelled the sign-in time-zone refresh), not the whole suite.
      name: 'webkit',
      testMatch: ['**/session-isolation.spec.ts', '**/first-navigation-after-sign-in.spec.ts'],
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: BASE_URL_OVERRIDE
    ? []
    : [
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
