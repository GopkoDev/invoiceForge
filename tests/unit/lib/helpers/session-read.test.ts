// Review R16-9 / T45: the AI section's greeting reads the account name from the same per-render session read as the
// acting Freelancer (React cache in a server render), so it adds no extra auth() call and user lookup per /ai render.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { readSession, authMock } = vi.hoisted(() => ({
  readSession: vi.fn(),
  authMock: vi.fn(),
}));
vi.mock('@/lib/helpers/session-read', () => ({ readSession }));
vi.mock('@/auth', () => ({ auth: authMock }));
vi.mock('server-only', () => ({}));

import { sessionAccountName } from '@/lib/helpers/account-name';
import { getAuthenticatedUser } from '@/lib/helpers/auth-helpers';

const SESSION = {
  user: { id: 'u1', name: 'Dmytro Hopko', email: 'd@example.com' },
  expires: '2999-01-01T00:00:00.000Z',
};

describe('one session read per render (R16-9)', () => {
  beforeEach(() => {
    readSession.mockReset();
    authMock.mockReset();
    authMock.mockRejectedValue(new Error('auth() called directly'));
    readSession.mockResolvedValue(SESSION);
  });

  it('sessionAccountName reads the shared session read, never auth() directly', async () => {
    await expect(sessionAccountName()).resolves.toBe('Dmytro Hopko');
    expect(readSession).toHaveBeenCalledTimes(1);
    expect(authMock).not.toHaveBeenCalled();
  });

  it('getAuthenticatedUser reads the same shared session read', async () => {
    await getAuthenticatedUser();
    expect(readSession).toHaveBeenCalledTimes(1);
    expect(authMock).not.toHaveBeenCalled();
  });

  it('a failed read leaves the greeting without a name', async () => {
    readSession.mockRejectedValue(new Error('down'));
    await expect(sessionAccountName()).resolves.toBeNull();
  });
});
