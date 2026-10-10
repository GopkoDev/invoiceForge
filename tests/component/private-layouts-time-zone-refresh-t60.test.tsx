// T60 (review 2026-10-10-r5 Q2, r4 P5; ADR-0010 amendment; AC-07, AC-08): the server reads the `tz`
// cookie only as a first-visit seed, while the account has no saved zone (lib/helpers/session-actor.ts,
// ADR-0006). So both private layouts let TimeZoneCookie refresh only for such an account. For an
// account with a saved zone the cookie is still written, but nothing re-renders, so no refresh can
// race (and cancel) the Freelancer's first navigation.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement, ReactNode } from 'react';

vi.mock('@/prisma', () => ({ prisma: {} }));
vi.mock('@/auth', () => ({ auth: async () => null, signOut: async () => {} }));
vi.mock('@/lib/helpers/route-auth', () => ({ requireLiveUser: async () => ({ userId: 'user-1' }) }));
vi.mock('next/navigation', async (importOriginal) => ({
  // Keep the real unstable_rethrow: the layout's saved-zone lookup (T60) uses it.
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ refresh: () => {} }),
}));
const getSavedTimeZone = vi.fn<(userId: string) => Promise<string | null>>();
vi.mock('@/lib/services/profile/profile', () => ({
  getSavedTimeZone: (userId: string) => getSavedTimeZone(userId),
}));

import ProtectedLayout from '@/app/(protected)/layout';
import InvoiceEditorLayout from '@/app/(invoice-editor)/layout';
import { TimeZoneCookie } from '@/components/time-zone-cookie';

type Layout = (p: { children: ReactNode }) => Promise<ReactNode>;

function findType(node: ReactNode, type: unknown): ReactElement<{ refresh?: boolean }> | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const hit = findType(n, type);
      if (hit) return hit;
    }
    return null;
  }
  const el = node as ReactElement<{ children?: ReactNode; refresh?: boolean }>;
  if (el.type === type) return el;
  return findType(el.props?.children, type);
}

async function cookieIsland(layout: unknown) {
  const tree = await (layout as Layout)({ children: 'page' });
  const island = findType(tree, TimeZoneCookie);
  expect(island).not.toBeNull();
  return island!;
}

const layouts = [
  ['(protected)', ProtectedLayout],
  ['(invoice-editor)', InvoiceEditorLayout],
] as const;

describe.each(layouts)('%s/layout.tsx — TimeZoneCookie refresh (T60)', (_name, layout) => {
  beforeEach(() => {
    getSavedTimeZone.mockReset();
  });

  it('does not refresh for an account with a saved zone', async () => {
    getSavedTimeZone.mockResolvedValue('Europe/Kyiv');
    const island = await cookieIsland(layout);
    expect(island.props.refresh).toBe(false);
    expect(getSavedTimeZone).toHaveBeenCalledWith('user-1');
  });

  it('refreshes for an account with no saved zone, so the first visit seeds it', async () => {
    getSavedTimeZone.mockResolvedValue(null);
    const island = await cookieIsland(layout);
    expect(island.props.refresh).not.toBe(false);
  });

  it('falls back to refreshing when the lookup fails', async () => {
    getSavedTimeZone.mockRejectedValue(new Error('db down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const island = await cookieIsland(layout);
    expect(island.props.refresh).not.toBe(false);
  });
});
