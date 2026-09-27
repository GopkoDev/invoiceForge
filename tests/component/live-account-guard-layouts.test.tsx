// T09 (spec.md §5 AC-21) — a stale token (account deleted on another device) must not render
// either private layout: it must land the device on sign-in instead, per SCR-01.
//
// adr/0002, Decision outcome, abridged: "It meets AC-21 with no migration and no forced
// sign-out... The stale token is cleared and the device lands on sign-in (SCR-01)."
// Checklist row (task file): "Call requireLiveUser() at the top of both group layouts —
// app/(protected)/layout.tsx, app/(invoice-editor)/layout.tsx".
//
// Lead design decision: a layout can't write cookies itself, so requireLiveUser() redirects to
// /api/auth/clear-session (a route handler that clears the cookie and redirects on to /login)
// instead of calling signOut() from the layout. signOut() is asserted as NOT called here.
//
// Edge case table (task file): "Stale token opens /dashboard -> Redirect to sign-in, cookie
// cleared, no data rendered."
//
// Seam: mocks '@/auth' (auth + signOut) and 'next/navigation' (redirect, modeled as throwing —
// the real NEXT_REDIRECT behaviour) so a test drives the session outcome directly, the same
// pattern as tests/unit/lib/helpers/route-auth.test.ts. Layouts are called directly as async
// functions (not mounted into the DOM) — the assertion is only about whether the live-account
// guard ran, not about the rendered sidebar/header markup, which is unrelated to this task.
//
// '@/prisma' is mocked for the same reason tests/unit/lib/helpers/route-auth.test.ts mocks it:
// route-auth.ts's module scope imports '@/prisma' for requireSession()'s own live-account check
// (T05), and that module throws at import time without a DATABASE_URL. requireLiveUser() itself
// never touches the database.
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/prisma', () => ({ prisma: {} }));

const authMock = vi.fn<() => Promise<{ user?: { id?: string } } | null>>();
const signOutMock = vi.fn();
vi.mock('@/auth', () => ({
  auth: () => authMock(),
  signOut: (...args: unknown[]) => signOutMock(...args),
}));

const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}));

import ProtectedLayout from '@/app/(protected)/layout';
import InvoiceEditorLayout from '@/app/(invoice-editor)/layout';

type LayoutFn = (props: { children: React.ReactNode }) => unknown;

describe('(protected)/layout.tsx — AC-21 live-account guard', () => {
  beforeEach(() => {
    authMock.mockReset();
    signOutMock.mockReset();
    redirectMock.mockClear();
  });

  it('redirects to the cookie-clearing route for a stale token with no live account', async () => {
    authMock.mockResolvedValue({ user: {} });

    await expect(async () => {
      await (ProtectedLayout as unknown as LayoutFn)({ children: 'secret dashboard data' });
    }).rejects.toThrow('REDIRECT:/api/auth/clear-session');

    expect(signOutMock).not.toHaveBeenCalled();
  });

  it('renders through (no redirect) for a session with a live account', async () => {
    authMock.mockResolvedValue({ user: { id: 'user_1' } });

    await (ProtectedLayout as unknown as LayoutFn)({ children: 'secret dashboard data' });

    expect(redirectMock).not.toHaveBeenCalled();
    expect(signOutMock).not.toHaveBeenCalled();
  });
});

describe('(invoice-editor)/layout.tsx — AC-21 live-account guard', () => {
  beforeEach(() => {
    authMock.mockReset();
    signOutMock.mockReset();
    redirectMock.mockClear();
  });

  it('redirects to the cookie-clearing route for a stale token with no live account', async () => {
    authMock.mockResolvedValue(null);

    await expect(async () => {
      await (InvoiceEditorLayout as unknown as LayoutFn)({ children: 'secret invoice data' });
    }).rejects.toThrow('REDIRECT:/api/auth/clear-session');

    expect(signOutMock).not.toHaveBeenCalled();
  });

  it('renders through (no redirect) for a session with a live account', async () => {
    authMock.mockResolvedValue({ user: { id: 'user_1' } });

    await (InvoiceEditorLayout as unknown as LayoutFn)({ children: 'secret invoice data' });

    expect(redirectMock).not.toHaveBeenCalled();
    expect(signOutMock).not.toHaveBeenCalled();
  });
});
