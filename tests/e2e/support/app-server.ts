// Single source of truth for the real-app webServer's port (F-12, T34) — shared by
// playwright.config.ts and route-sweep.spec.ts. The webServer command itself
// (start-app-server.mjs) is plain JS run outside Playwright's TS loader, so it keeps its own
// matching default rather than importing this file; APP_E2E_PORT below is passed to it via env.
export const APP_E2E_PORT = 4311;
export const APP_E2E_URL = `http://127.0.0.1:${APP_E2E_PORT}`;
