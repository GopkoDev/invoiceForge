// T41 (H-03; sad.md §8): /api/mcp request data stays out of Sentry transaction events too.
import { beforeAll, describe, expect, it, vi } from 'vitest';

type Opts = {
  beforeSendTransaction?: (event: unknown) => { request?: Record<string, unknown> };
  integrations?: unknown[];
};
let opts: Opts;
// Captured in beforeAll: vitest clears mock call history before each test.
let httpCalls: unknown[][];
const httpIntegration = vi.fn((o?: unknown) => ({ name: 'Http', options: o }));

beforeAll(async () => {
  vi.resetModules();
  vi.stubEnv('SENTRY_DSN', 'https://k@example.ingest.sentry.io/1');
  vi.stubEnv('NODE_ENV', 'production');
  const init = vi.fn();
  vi.doMock('@sentry/nextjs', () => ({ init, httpIntegration }));
  await import('@/sentry.server.config');
  opts = init.mock.calls[0]?.[0] as Opts;
  httpCalls = [...httpIntegration.mock.calls];
});

describe('Sentry transactions on /api/mcp (H-03)', () => {
  it('beforeSendTransaction drops headers, cookies and body of an /api/mcp transaction', () => {
    expect(typeof opts.beforeSendTransaction).toBe('function');
    const out = opts.beforeSendTransaction!({
      type: 'transaction',
      request: {
        url: 'https://app.example/api/mcp',
        headers: { authorization: 'Bearer ifk_secret' },
        data: '{"x":1}',
      },
    });
    expect(JSON.stringify(out)).not.toContain('ifk_secret');
    expect(out.request).toEqual({ url: 'https://app.example/api/mcp' });
  });

  it.each(['https://app.example/api/mcp/', 'https://app.example/api/mcp/?x=1'])(
    'scrubs a transaction for %s (I-03)',
    (url) => {
      const out = opts.beforeSendTransaction!({
        type: 'transaction',
        request: { url, headers: { authorization: 'Bearer ifk_secret' }, data: 'x' },
      });
      expect(JSON.stringify(out)).not.toContain('ifk_secret');
      expect(out.request).toEqual({ url });
    }
  );

  it.each([
    'https://app.example//api/mcp',
    'https://app.example/api//mcp',
    'https://app.example/api/mcp//',
    'https://app.example/api\\mcp',
  ])('scrubs a transaction for %s (J-01)', (url) => {
    const out = opts.beforeSendTransaction!({
      type: 'transaction',
      request: { url, headers: { authorization: 'Bearer ifk_secret' }, data: 'x' },
    });
    expect(JSON.stringify(out)).not.toContain('ifk_secret');
    expect(out.request).toEqual({ url });
  });

  it.each([
    'https://app.example/api/%6Dcp',
    'https://app.example/%61pi/mcp',
    'https://app.example/api/mcp%2F',
    'https://app.example/api/%ZZmcp',
  ])('scrubs a transaction for %s (M-01)', (url) => {
    const out = opts.beforeSendTransaction!({
      type: 'transaction',
      request: { url, headers: { authorization: 'Bearer ifk_secret' }, data: 'x' },
    });
    expect(JSON.stringify(out)).not.toContain('ifk_secret');
    expect(out.request).toEqual({ url });
  });

  it('does not scrub a transaction for /api/mcpx or /api/mcp/other', () => {
    for (const url of ['https://app.example/api/mcpx', 'https://app.example/api/mcp/other']) {
      const out = opts.beforeSendTransaction!({
        type: 'transaction',
        request: { url, headers: { h: 'v' } },
      });
      expect(out.request).toEqual({ url, headers: { h: 'v' } });
    }
  });

  it('ignores the incoming request body on /api/mcp only', () => {
    expect(httpCalls.length).toBeGreaterThan(0);
    const arg = httpCalls[0]?.[0] as
      | { ignoreIncomingRequestBody?: (url: string) => boolean; disableIncomingRequestSpans?: boolean }
      | undefined;
    // @sentry/nextjs's own default keeps these off ("Next.js does that by itself").
    expect(arg?.disableIncomingRequestSpans).toBe(true);
    const ignore = arg?.ignoreIncomingRequestBody;
    expect(typeof ignore).toBe('function');
    expect(ignore!('https://app.example/api/mcp')).toBe(true);
    expect(ignore!('/api/mcp?x=1')).toBe(true);
    expect(ignore!('/api/mcp/')).toBe(true);
    expect(ignore!('/api/mcp/?x=1')).toBe(true);
    expect(ignore!('//api/mcp')).toBe(true);
    expect(ignore!('/api//mcp')).toBe(true);
    expect(ignore!('/api/mcp//')).toBe(true);
    expect(ignore!('/api/%6Dcp')).toBe(true);
    expect(ignore!('https://app.example/%61pi/mcp')).toBe(true);
    expect(ignore!('/api/%ZZmcp')).toBe(true);
    expect(ignore!('/api/mcpx')).toBe(false);
    expect(ignore!('/api/mcp/other')).toBe(false);
    expect(ignore!('https://app.example/api/other')).toBe(false);
    expect(opts.integrations).toContainEqual(expect.objectContaining({ name: 'Http' }));
  });
});
