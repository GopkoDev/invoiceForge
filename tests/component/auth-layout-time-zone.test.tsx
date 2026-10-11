// T57 (review r4 P5; spec.md §5 AC-07, AC-08) — the (auth) layout (/login, /verify-request, the
// sign-in error page) mounts <TimeZoneCookie refresh={false} />: the browser zone is in the `tz`
// cookie before the Sign-in link lands on a private page, so the private layout does not need a
// router.refresh() that the Freelancer's first navigation could cancel. No refresh here: the
// sign-in pages render nothing that depends on the zone.
import { describe, expect, it, vi } from 'vitest';
import type { ReactElement, ReactNode } from 'react';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));

import AuthLayout from '@/app/(auth)/layout';
import { TimeZoneCookie } from '@/components/time-zone-cookie';

function findType(node: ReactNode, type: unknown): ReactElement<Record<string, unknown>> | undefined {
  if (!node || typeof node !== 'object') return undefined;
  if (Array.isArray(node)) {
    for (const n of node) {
      const hit = findType(n, type);
      if (hit) return hit;
    }
    return undefined;
  }
  const el = node as ReactElement<{ children?: ReactNode }>;
  if (el.type === type) return el as ReactElement<Record<string, unknown>>;
  return findType(el.props?.children, type);
}

describe('(auth)/layout.tsx — zone written before sign-in (T57, P5)', () => {
  it('mounts TimeZoneCookie without a refresh', () => {
    const tree = (AuthLayout as unknown as (p: { children: ReactNode }) => ReactNode)({
      children: 'login',
    });
    const island = findType(tree, TimeZoneCookie);
    expect(island, 'the (auth) layout must mount TimeZoneCookie').toBeDefined();
    expect(island?.props.refresh).toBe(false);
  });
});
