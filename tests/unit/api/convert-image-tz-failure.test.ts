// T30 (service-layer review 2026-10-02 N-1; spec.md §5 AC-04; contracts/public-api.md §1) — when the
// one-time time-zone lookup fails, POST /api/convert-image answers its documented 502 UNAVAILABLE
// body, so the PDF logo warning stays the generic plain-language text, not the factory's default 500.
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/helpers/route-auth', () => ({ requireSession: async () => ({ ok: true, userId: 'user-1' }) }));
vi.mock('@/lib/helpers/auth-helpers', () => ({ getAuthenticatedUser: async () => ({ success: false }) }));
vi.mock('@/lib/helpers/time-zone', () => ({ getRequestTimeZone: async () => 'Europe/Kyiv' }));
vi.mock('@/lib/services/_shared/time-zone', () => ({
  resolveTimeZone: async (raw?: string) => {
    if (!raw || raw === 'UTC') return 'UTC';
    throw new Error('pg_timezone_names unavailable');
  },
}));
const getSenderProfileLogo = vi.hoisted(() => vi.fn());
vi.mock('@/lib/services/sender-profiles/sender-profiles', () => ({ getSenderProfileLogo }));
const consumeLogoFetch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/security/logo-rate-limit', () => ({ consumeLogoFetch }));
vi.mock('@sentry/nextjs', () => ({ captureException: () => {}, captureMessage: () => {} }));

const request = () =>
  new Request('http://localhost/api/convert-image', {
    method: 'POST',
    body: JSON.stringify({ senderProfileId: 'sp-1' }),
  });

describe('POST /api/convert-image — failed time-zone lookup (T30, N-1)', () => {
  it('answers 502 with the documented UNAVAILABLE body and never looks up the logo', async () => {
    const { POST } = await import('@/app/api/convert-image/route');
    const res = await POST(request() as never);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      success: false,
      code: 'UNAVAILABLE',
      error: 'The logo could not be loaded from this link.',
    });
    expect(getSenderProfileLogo).not.toHaveBeenCalled();
    expect(consumeLogoFetch).not.toHaveBeenCalled();
  });

  it('shows the generic logo warning through fetchLogoDataUrl', async () => {
    const { POST } = await import('@/app/api/convert-image/route');
    const { fetchLogoDataUrl } = await import('@/lib/utils/image-to-base64');
    vi.stubGlobal('fetch', async (_url: string, init: { body: string }) =>
      POST(new Request('http://localhost/api/convert-image', { method: 'POST', body: init.body }) as never)
    );
    try {
      const result = await fetchLogoDataUrl('sp-tz', 'https://example.com/logo.png');
      expect(result).toEqual({ warning: 'The logo could not be loaded from this link.' });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
