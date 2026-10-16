// @baseline — records the landing page's first-load compressed JS (tests/e2e/support/landing-js-baseline.json).
// Skipped unless explicitly requested: run it via `node scripts/measure-landing-js.mjs`.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { APP_E2E_URL } from './support/app-server';
import { skipWithoutContainerRuntime } from './support/require-container-runtime';
import {
  looksLikeDevServer,
  measureLandingJsSize,
} from './support/landing-js-size';

test.skip(
  process.env.MEASURE_LANDING_JS !== '1',
  'baseline recorder: run scripts/measure-landing-js.mjs'
);

test('@baseline record landing first-load JS size', async ({ browser }, testInfo) => {
  await skipWithoutContainerRuntime(testInfo);
  const { bytes, scripts } = await measureLandingJsSize(browser, APP_E2E_URL);
  expect(looksLikeDevServer(scripts), 'refusing to record from a dev server').toBe(false);
  expect(scripts.length).toBeGreaterThan(0);
  expect(bytes).toBeGreaterThan(0);

  const commit = execFileSync('git', ['rev-parse', 'HEAD']).toString().trim();
  const out = path.join(process.cwd(), 'tests/e2e/support/landing-js-baseline.json');
  fs.writeFileSync(
    out,
    JSON.stringify({ commit, measuredAt: new Date().toISOString(), bytes }, null, 2) + '\n'
  );
  console.log(`landing first-load JS: ${bytes} bytes over ${scripts.length} scripts`);
  for (const s of scripts) console.log(`  ${s.bytes}\t${s.url}`);
});
