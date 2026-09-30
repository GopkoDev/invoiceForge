// T3 (AC-10, AC-21) — actingFreelancerFromSession() and the pure day-bound helpers' new home.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = vi.fn();
const cookieGet = vi.fn();
vi.mock('@/auth', () => ({ auth: () => authMock() }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: cookieGet }) }));
vi.mock('@/lib/services/_shared/time-zone', async (orig) => ({
  ...(await orig<typeof import('@/lib/services/_shared/time-zone')>()),
  resolveTimeZone: async (raw?: string) => raw ?? 'UTC',
}));

describe('actingFreelancerFromSession (T3, AC-10)', () => {
  beforeEach(() => {
    authMock.mockReset();
    cookieGet.mockReset();
  });

  it('returns UNAUTHORIZED "Not signed in." without a live account', async () => {
    authMock.mockResolvedValue(null);
    const { actingFreelancerFromSession } = await import('@/lib/helpers/session-actor');
    const result = await actingFreelancerFromSession();
    expect(result).toMatchObject({ success: false, code: 'UNAUTHORIZED', error: 'Not signed in.' });
  });

  it('returns an ActingFreelancer with the tz cookie zone for a live session', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1' } });
    cookieGet.mockReturnValue({ value: 'Europe/Kyiv' });
    const { actingFreelancerFromSession } = await import('@/lib/helpers/session-actor');
    const result = await actingFreelancerFromSession();
    expect(result).toMatchObject({ success: true, data: { userId: 'u1', timeZone: 'Europe/Kyiv' } });
  });
});

describe('day-bound helpers in lib/services/_shared/time-zone (T3, AC-21)', () => {
  it('puts 2026-10-01T00:30+03:00 in October for Europe/Kyiv, not September', async () => {
    const { localDayRange, startOfLocalDay } = await import('@/lib/services/_shared/time-zone');
    const instant = new Date('2026-10-01T00:30:00+03:00');
    const [sepStart, sepEnd] = localDayRange('2026-09-01', '2026-09-30', 'Europe/Kyiv');
    expect(instant >= sepStart && instant < sepEnd).toBe(false);
    const [octStart, octEnd] = localDayRange('2026-10-01', '2026-10-31', 'Europe/Kyiv');
    expect(instant >= octStart && instant < octEnd).toBe(true);
    expect(startOfLocalDay(instant, 'Europe/Kyiv').toISOString()).toBe('2026-09-30T21:00:00.000Z');
  });

  it('lib/helpers/time-zone re-exports the same functions', async () => {
    const moved = await import('@/lib/services/_shared/time-zone');
    const legacy = await import('@/lib/helpers/time-zone');
    expect(legacy.localDayRange).toBe(moved.localDayRange);
    expect(legacy.startOfLocalDay).toBe(moved.startOfLocalDay);
    expect(legacy.currentLocalMonth).toBe(moved.currentLocalMonth);
    expect(legacy.formatLocalDateKey).toBe(moved.formatLocalDateKey);
  });
});
