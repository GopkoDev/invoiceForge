// Forces the editor's next save to fail the way a server that could not store it does: the
// server-action POST is answered with a FAILED result (the answer that makes the editor offer
// Retry) and never reaches the app, so nothing is stored. An aborted request would not do: the
// editor treats a rejected save as a signed-out session. Later server-action calls go through.
import type { Page } from '@playwright/test';

export const FORCED_FAILURE_MESSAGE = 'Could not reach the server.';

async function buildId(page: Page): Promise<string> {
  const html = await page.content();
  return /\\"b\\":\\"([^"\\]+)/.exec(html)?.[1] ?? '';
}

/** The next server-action POST from this page is answered with a FAILED result. */
export async function failNextSave(page: Page): Promise<void> {
  const b = await buildId(page);
  let spent = false;
  const handler = async (route: import('@playwright/test').Route) => {
    const request = route.request();
    if (spent || request.method() !== 'POST' || !request.headers()['next-action']) {
      return route.fallback();
    }
    spent = true;
    await route.fulfill({
      status: 200,
      contentType: 'text/x-component',
      body:
        `0:${JSON.stringify({ a: '$@1', f: '', q: '', i: false, b })}\n` +
        `1:${JSON.stringify({ success: false, code: 'FAILED', error: FORCED_FAILURE_MESSAGE })}\n`,
    });
    await page.unroute('**/*', handler);
  };
  await page.route('**/*', handler);
}
