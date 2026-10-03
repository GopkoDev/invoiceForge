// Single source of truth for the real-app webServer's port (F-12, T34) — shared by
// playwright.config.ts and the real-app specs. The webServer command itself
// (start-app-server.mjs) is plain JS run outside Playwright's TS loader, so it keeps its own
// matching default rather than importing this file; APP_E2E_PORT below is passed to it via env.
//
// T20: BASE_URL points the same specs at a preview deploy (no local server is started then).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const APP_E2E_PORT = 4311;
export const BASE_URL_OVERRIDE =
  process.env.BASE_URL?.replace(/\/+$/, '') || undefined;
export const APP_E2E_URL =
  BASE_URL_OVERRIDE ?? `http://127.0.0.1:${APP_E2E_PORT}`;

/**
 * T21 (AC-04, AC-06): a twin of the local app (same build, same database) that start-app-server.mjs
 * boots with a different AUTH_SECRET, so every session check fails on it. Local runs only.
 */
export const BROKEN_CHECK_PORT = 4312;
export const BROKEN_CHECK_URL = `http://127.0.0.1:${BROKEN_CHECK_PORT}`;

/** Where start-app-server.mjs leaves the throwaway database URL and the mail sink's inbox. */
export const E2E_RUNTIME_DIR = path.join(os.tmpdir(), 'invoceflow-e2e');

export interface E2eRuntime {
  databaseUrl: string;
  mailDir: string;
}

export function readE2eRuntime(): E2eRuntime {
  return JSON.parse(
    fs.readFileSync(path.join(E2E_RUNTIME_DIR, 'runtime.json'), 'utf8')
  ) as E2eRuntime;
}
