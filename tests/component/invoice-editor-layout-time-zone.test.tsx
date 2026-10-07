// T40 (review-2026-10-05-r2 H-01; spec.md §5 AC-12, AC-19, AC-23b, AC-24) — the (invoice-editor)
// layout must mount <TimeZoneCookie />, so a first private visit to /invoices/<id>/edit (Assistant
// link, bookmark, sign-in return) seeds the account zone like every (protected) page does.
import { describe, expect, it, vi } from 'vitest';
import type { ReactElement, ReactNode } from 'react';

vi.mock('@/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/helpers/route-auth', () => ({ requireLiveUser: async () => ({}) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));

import InvoiceEditorLayout from '@/app/(invoice-editor)/layout';
import { TimeZoneCookie } from '@/components/time-zone-cookie';

function containsType(node: ReactNode, type: unknown): boolean {
  if (!node || typeof node !== 'object') return false;
  if (Array.isArray(node)) return node.some((n) => containsType(n, type));
  const el = node as ReactElement<{ children?: ReactNode }>;
  return el.type === type || containsType(el.props?.children, type);
}

describe('(invoice-editor)/layout.tsx — zone seed (T40, H-01)', () => {
  it('mounts TimeZoneCookie', async () => {
    const tree = await (InvoiceEditorLayout as unknown as (p: { children: ReactNode }) => Promise<ReactNode>)({
      children: 'editor',
    });
    expect(containsType(tree, TimeZoneCookie)).toBe(true);
  });
});
