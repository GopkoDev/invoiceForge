// T23 (service-layer review 2026-10-01 S-03; spec.md §5 AC-04; contracts/public-api.md §3 rule 4) —
// one failed logo lookup is reported once. getSenderProfileLogo's failed() already captured the
// real cause; the route must not add a second event by throwing an Error that onRequestError
// would report again.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const findFirstMock = vi.hoisted(() => vi.fn());
vi.mock('@/prisma', () => ({ prisma: { senderProfile: { findFirst: findFirstMock } } }));

const captureException = vi.hoisted(() => vi.fn());
const captureRequestError = vi.hoisted(() => vi.fn());
vi.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => captureException(...args),
  captureMessage: () => {},
  captureRequestError: (...args: unknown[]) => captureRequestError(...args),
}));

vi.mock('@/lib/helpers/session-actor', () => ({
  actingFreelancerForRoute: async () => ({ ok: true, actor: { userId: 'user-1', timeZone: 'UTC' } }),
}));
vi.mock('@/lib/security/logo-rate-limit', () => ({ consumeLogoFetch: vi.fn() }));

describe('POST /api/convert-image — a failed lookup (T23, S-03)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('produces exactly one Sentry event for the failure, including the framework request-error hook', async () => {
    findFirstMock.mockRejectedValue(new Error('connection reset'));
    const { POST } = await import('@/app/api/convert-image/route');
    const { onRequestError } = await import('@/instrumentation');
    const request = new Request('http://localhost/api/convert-image', {
      method: 'POST',
      body: JSON.stringify({ senderProfileId: 'sp-1' }),
    });

    let status: number | undefined;
    try {
      status = (await POST(request as never)).status;
    } catch (error) {
      // What Next does with an unhandled throw.
      (onRequestError as (...a: unknown[]) => unknown)(error, {}, {});
    }

    expect(captureException.mock.calls.length + captureRequestError.mock.calls.length).toBe(1);
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(status).toBe(500);
  });
});
