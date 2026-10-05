// T41 (H-06, H-07, H-12; AC-07, AC-11): SDK failures are reported and never echoed, a client
// abort is a client error, and 405 carries the contract MethodNotAllowed body.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const captureExceptionMock = vi.fn();
vi.mock('@sentry/nextjs', () => ({ captureException: (...a: unknown[]) => captureExceptionMock(...a) }));
vi.mock('@/lib/mcp/server', () => ({ createMcpServer: () => ({ connect: vi.fn() }) }));
vi.mock('@/lib/mcp/authenticate', () => ({
  runMcpPipeline: vi.fn().mockResolvedValue({ ok: true, actor: { userId: 'u' }, keyId: 'k' }),
}));

const RAW = new Error('SECRET-RAW-TEXT');
vi.mock('@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js', () => ({
  WebStandardStreamableHTTPServerTransport: class {
    onerror?: (e: Error) => void;
    async handleRequest(): Promise<Response> {
      this.onerror?.(RAW);
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32700, message: 'Parse error', data: String(RAW) },
        }),
        { status: 400, headers: { 'content-type': 'application/json' } }
      );
    }
  },
}));

const headers = { accept: 'application/json, text/event-stream', 'content-type': 'application/json' };

beforeEach(() => vi.clearAllMocks());

describe('POST /api/mcp transport failures (H-06)', () => {
  it('reports the SDK error to Sentry and does not echo its text', async () => {
    const { POST } = await import('@/app/api/mcp/route');
    const res = await POST(new Request('http://x/api/mcp', { method: 'POST', body: '{}', headers }));
    expect(captureExceptionMock).toHaveBeenCalledWith(RAW);
    expect(await res.text()).not.toContain('SECRET-RAW-TEXT');
  });
});

describe('POST /api/mcp client abort (H-07)', () => {
  it('answers a 4xx refusal and reports nothing when the body read throws', async () => {
    const body = new ReadableStream({
      pull() {
        throw new Error('aborted');
      },
    });
    const req = new Request('http://x/api/mcp', {
      method: 'POST',
      body,
      headers,
      // @ts-expect-error Node fetch option
      duplex: 'half',
    });
    const { POST } = await import('@/app/api/mcp/route');
    const res = await POST(req);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(captureExceptionMock).not.toHaveBeenCalled();
  });
});

describe('405 (H-12)', () => {
  it.each(['GET', 'DELETE'] as const)('%s answers the contract MethodNotAllowed body', async (m) => {
    const route = await import('@/app/api/mcp/route');
    const res = await route[m]();
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
    expect(await res.json()).toEqual({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32000, message: 'Method not allowed.' },
    });
  });
});
