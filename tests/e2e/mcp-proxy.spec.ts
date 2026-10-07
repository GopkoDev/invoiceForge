// AC-09 (test-plan.md, e2e): the Assistant endpoint answers a Visitor and a signed-in browser with
// no key the same way, through the real proxy and handler of the production build. The session
// cookie is never read there (ADR-0003), so a Freelancer's own browser gets no data either.
import { test, expect, type APIResponse } from '@playwright/test';
import { APP_E2E_URL } from './support/app-server';
import {
  openSignedInFreelancer,
  type SignedInFreelancer,
} from './support/signed-in';
import { MCP_PATH } from '../../config/routes.config';

const TOOLS_LIST = { jsonrpc: '2.0', id: 1, method: 'tools/list' };

test.describe.configure({ mode: 'default', timeout: 150_000 });

test.describe('AC-09 the Assistant endpoint refuses a call without a Personal key', () => {
  let freelancer: SignedInFreelancer;

  test.beforeAll(async ({ browser }, testInfo) => {
    test.setTimeout(240_000);
    freelancer = await openSignedInFreelancer(browser, testInfo, 'mcp-proxy');
  });

  test.afterAll(async () => {
    await freelancer?.context.close();
  });

  async function expectRefusedWithNoData(response: APIResponse) {
    expect(response.status()).toBe(401);
    expect(response.headers()['www-authenticate']).toContain('Bearer');
    const text = await response.text();
    expect(JSON.parse(text).error.data).toEqual({ code: 'UNAUTHORIZED' });
    for (const secret of [
      freelancer.email,
      freelancer.workspace.invoiceNumber,
      'Test Item',
    ]) {
      expect(text, 'no Freelancer data in a refusal').not.toContain(secret);
    }
  }

  test('a Visitor with no key and no session is refused', async ({
    playwright,
  }) => {
    const visitor = await playwright.request.newContext();
    try {
      const response = await visitor.post(`${APP_E2E_URL}${MCP_PATH}`, {
        data: TOOLS_LIST,
        maxRedirects: 0,
      });
      await expectRefusedWithNoData(response);
    } finally {
      await visitor.dispose();
    }
  });

  test('a signed-in browser calling with its session cookie and no key is refused', async () => {
    const cookies = await freelancer.context.cookies();
    expect(
      cookies.length,
      'the browser holds a genuine session'
    ).toBeGreaterThan(0);
    const response = await freelancer.context.request.post(
      `${APP_E2E_URL}${MCP_PATH}`,
      { data: TOOLS_LIST, maxRedirects: 0 }
    );
    await expectRefusedWithNoData(response);
  });

  test('a key-shaped value that is not a real key is refused the same way', async ({
    playwright,
  }) => {
    const visitor = await playwright.request.newContext();
    try {
      const response = await visitor.post(`${APP_E2E_URL}${MCP_PATH}`, {
        data: TOOLS_LIST,
        headers: { authorization: 'Bearer ifk_not-a-real-key' },
        maxRedirects: 0,
      });
      await expectRefusedWithNoData(response);
    } finally {
      await visitor.dispose();
    }
  });
});
