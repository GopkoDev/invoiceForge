// Landing-page first-load JavaScript size: the sum of the ENCODED (compressed, as transferred)
// body size of every script response the app origin serves while an anonymous Visitor loads `/`.
// Reused by the baseline recorder (scripts/measure-landing-js.mjs) and the later JS budget check.
//
// Sizes come from Playwright's `request.sizes().responseBodySize` (CDP encodedDataLength minus
// headers), i.e. the bytes of the compressed body on the wire. A fresh context with the HTTP
// cache disabled (and service workers blocked) keeps cached responses from reporting 0.
import type { Browser } from '@playwright/test';

// Third-party beacons on the app origin that are not landing code.
const EXCLUDED_PATH = /\/_vercel\/(insights|speed-insights)\//;

export interface LandingJsSize {
  bytes: number;
  scripts: { url: string; bytes: number }[];
}

export async function measureLandingJsSize(
  browser: Browser,
  baseURL: string
): Promise<LandingJsSize> {
  const origin = new URL(baseURL).origin;
  const context = await browser.newContext({ serviceWorkers: 'block' });
  try {
    const page = await context.newPage();
    // Disable the browser cache so every script is actually transferred.
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });

    const pending: Promise<{ url: string; bytes: number }>[] = [];
    page.on('response', (response) => {
      const request = response.request();
      if (request.resourceType() !== 'script') return;
      const url = new URL(response.url());
      if (url.origin !== origin || EXCLUDED_PATH.test(url.pathname)) return;
      pending.push(
        response
          .finished()
          .then(() => request.sizes())
          .then((sizes) => ({
            url: url.pathname,
            // -1 means "unknown" (a few opaque script-typed requests); never subtract.
            bytes: Math.max(0, sizes.responseBodySize),
          }))
      );
    });

    await page.goto(`${origin}/`, { waitUntil: 'load' });
    await page.waitForLoadState('networkidle');
    const scripts = await Promise.all(pending);
    return { bytes: scripts.reduce((sum, s) => sum + s.bytes, 0), scripts };
  } finally {
    await context.close();
  }
}

/** A dev server serves unhashed, uncompressed, HMR-wired scripts: its size is meaningless. */
export function looksLikeDevServer(scripts: { url: string }[]): boolean {
  return scripts.some((s) => /webpack-hmr|\[root-of-the-server\]|%5Bturbopack%5D/.test(s.url));
}
