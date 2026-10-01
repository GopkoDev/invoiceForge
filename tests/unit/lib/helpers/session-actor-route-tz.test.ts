// T23 (service-layer review 2026-10-01 S-11; spec.md §5 AC-04) — actingFreelancerForRoute must not
// let a failed one-time pg_timezone_names lookup escape as the framework's default 500: the
// route keeps working with the UTC fallback, as the action factory does.
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/helpers/auth-helpers', () => ({ getAuthenticatedUser: async () => ({ success: false }) }));
vi.mock('@/lib/helpers/route-auth', () => ({ requireSession: async () => ({ ok: true, userId: 'user-1' }) }));
vi.mock('@/lib/helpers/time-zone', () => ({ getRequestTimeZone: async () => 'Europe/Kyiv' }));
vi.mock('@/lib/services/_shared/time-zone', () => ({
  resolveTimeZone: async (raw?: string) => {
    if (!raw || raw === 'UTC') return 'UTC';
    throw new Error('pg_timezone_names unavailable');
  },
}));
vi.mock('@sentry/nextjs', () => ({ captureException: () => {}, captureMessage: () => {} }));

describe('actingFreelancerForRoute (T23, S-11)', () => {
  it('falls back to UTC when the time-zone lookup throws', async () => {
    const { actingFreelancerForRoute } = await import('@/lib/helpers/session-actor');
    const session = await actingFreelancerForRoute();
    expect(session).toMatchObject({ ok: true, actor: { userId: 'user-1', timeZone: 'UTC' } });
  });
});
