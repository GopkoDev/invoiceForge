// T29 (service-layer review R-08; spec.md §5 AC-04; S-11) — when the one-time time-zone lookup
// fails, GET /api/user/export still answers its documented 500 EXPORT_FAILED body, not the
// framework's default 500 and not a thrown error.
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
vi.mock('@/lib/services/account/account', () => ({
  getAccountExport: async () => ({ success: true, data: { leaked: true } }),
}));
vi.mock('@sentry/nextjs', () => ({ captureException: () => {}, captureMessage: () => {} }));

describe('GET /api/user/export — failed time-zone lookup (T29, R-08)', () => {
  it('answers 500 with the documented EXPORT_FAILED body and does not export', async () => {
    const { GET } = await import('@/app/api/user/export/route');
    const res = await GET();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      success: false,
      code: 'FAILED',
      error: "Your data couldn't be exported. Try again.",
    });
  });
});
