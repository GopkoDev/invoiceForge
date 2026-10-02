// T3 (AC-10) — actingFreelancerForRoute() without a session returns today's 401 NotSignedIn body.
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn(async () => null) }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));

describe('actingFreelancerForRoute (T3, AC-10)', () => {
  it('returns ok:false with the unchanged 401 body when there is no session', async () => {
    const { actingFreelancerForRoute } = await import('@/lib/helpers/session-actor');
    const result = await actingFreelancerForRoute();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(401);
    expect(await result.response.json()).toEqual({ success: false, code: 'UNAUTHORIZED', error: 'Not signed in.' });
  });
});
