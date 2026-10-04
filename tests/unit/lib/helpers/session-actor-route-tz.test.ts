// T23/T29 (service-layer reviews S-11, R-08; spec.md §5 AC-04) — a failed one-time
// pg_timezone_names lookup must not escape as the framework's default 500. Both session factories
// behave the same way: report the error once to Sentry and return FAILED (the route factory as
// { ok: false }, and the route answers with its own documented error body).
import { beforeEach, describe, expect, it, vi } from 'vitest';

const captureException = vi.hoisted(() => vi.fn());

vi.mock('@/lib/helpers/auth-helpers', () => ({ getAuthenticatedUser: async () => ({ success: false }) }));
vi.mock('@/lib/helpers/route-auth', () => ({ requireSession: async () => ({ ok: true, userId: 'user-1' }) }));
vi.mock('@/lib/helpers/time-zone', () => ({ getBrowserTimeZone: async () => 'Europe/Kyiv' }));
vi.mock('@/lib/services/profile/profile', () => ({
  getSavedTimeZone: async () => null,
  seedTimeZoneIfEmpty: async () => true,
}));
vi.mock('@/lib/services/_shared/time-zone', () => ({
  resolveTimeZone: async (raw?: string) => {
    if (!raw || raw === 'UTC') return 'UTC';
    throw new Error('pg_timezone_names unavailable');
  },
}));
vi.mock('@sentry/nextjs', () => ({
  captureException: (...a: unknown[]) => captureException(...a),
  captureMessage: () => {},
}));

describe('actingFreelancerForRoute (T29, R-08)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns FAILED (not a UTC fallback) and reports the lookup error exactly once', async () => {
    const { actingFreelancerForRoute } = await import('@/lib/helpers/session-actor');
    const session = await actingFreelancerForRoute();
    expect(session.ok).toBe(false);
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it('actingFreelancerFromSession behaves the same way: FAILED and one report', async () => {
    vi.doMock('@/lib/helpers/auth-helpers', () => ({
      getAuthenticatedUser: async () => ({ success: true, data: { userId: 'user-1' } }),
    }));
    vi.resetModules();
    const { actingFreelancerFromSession } = await import('@/lib/helpers/session-actor');
    const result = await actingFreelancerFromSession();
    expect(result).toMatchObject({ success: false, code: 'FAILED' });
    expect(captureException).toHaveBeenCalledTimes(1);
  });
});
