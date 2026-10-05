// T29 (F-08, F-13; AC-07, AC-18b): the route's 500 body is the contract's ServerFailure and the
// failure reaches Sentry; the Bearer scheme match is case-insensitive.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const captureExceptionMock = vi.fn();
vi.mock('@sentry/nextjs', () => ({ captureException: (...a: unknown[]) => captureExceptionMock(...a) }));

vi.mock('@/lib/mcp/server', () => ({ createMcpServer: vi.fn() }));

const authenticateMock = vi.fn();
vi.mock('@/lib/services/personal-keys/authenticate', () => ({
  authenticatePersonalKey: (...a: unknown[]) => authenticateMock(...a),
}));
vi.mock('@/lib/security/limits/mcp', () => ({
  checkMcpSource: vi.fn(),
  recordRefusedKeyCheck: vi.fn(),
  takeMcpKeyCall: vi.fn().mockResolvedValue({ allowed: true }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/mcp failure', () => {
  it('answers the contract ServerFailure and reports the error to Sentry', async () => {
    const boom = new Error('connect failed');
    authenticateMock.mockRejectedValue(boom);
    const { POST } = await import('@/app/api/mcp/route');
    const res = await POST(
      new Request('http://x/api/mcp', {
        method: 'POST',
        body: '{}',
        headers: { authorization: 'Bearer ifk_abc' },
      })
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32603, message: 'Something went wrong in Invoice Forge. Try again.' },
    });
    expect(captureExceptionMock).toHaveBeenCalledWith(boom);
  });
});

describe('Bearer scheme (AC-07)', () => {
  it.each(['Bearer', 'bearer', 'BEARER'])('accepts the scheme written as %s', async (scheme) => {
    authenticateMock.mockResolvedValue({ ok: true, actor: { userId: 'u' }, keyId: 'k' });
    const { runMcpPipeline } = await import('@/lib/mcp/authenticate');
    const res = await runMcpPipeline(
      new Request('http://x/api/mcp', { method: 'POST', headers: { authorization: `${scheme} ifk_abc` } })
    );
    expect(res.ok).toBe(true);
    expect(authenticateMock).toHaveBeenCalledWith('ifk_abc', expect.any(Date));
  });
});
