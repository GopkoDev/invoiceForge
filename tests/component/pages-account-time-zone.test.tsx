// T28 (spec.md §5 AC-22, AC-23; adr/0006-save-the-freelancer-time-zone-on-the-account.md;
// review F-05) — the dashboard and the invoice list build their period presets from the account
// zone (the ActingFreelancer from the session), never from the `tz` cookie, which only seeds the
// first visit. Pages are async Server Components called directly, as in page-outcome-routing.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement, ReactNode } from 'react';

const SAVED_ZONE = 'Pacific/Auckland';
const COOKIE_ZONE = 'America/Los_Angeles';

vi.mock('@/lib/helpers/session-actor', () => ({
  actingFreelancerFromSession: vi.fn(async () => ({
    success: true,
    data: { userId: 'u1', timeZone: 'Pacific/Auckland' },
  })),
}));
vi.mock('@/lib/helpers/time-zone', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/helpers/time-zone')>()),
  getRequestTimeZone: vi.fn(async () => 'America/Los_Angeles'),
}));
vi.mock('@/components/layout/content-area', () => ({
  unwrapPageResult: (r: { success: boolean; data: unknown }) => {
    if (!r.success) throw new Error('load_failed');
    return r.data;
  },
}));
vi.mock('@/lib/actions/dashboard-actions', () => ({
  getDashboardCurrencyTabs: vi.fn(async () => ({ success: true, data: [] })),
  getDashboardNoticeState: vi.fn(async () => ({
    success: true,
    data: { showOverdueRuleNotice: false },
  })),
  getConnectAiEntryState: vi.fn(async () => ({
    success: true,
    data: { showConnectAiEntry: false },
  })),
}));
vi.mock('@/lib/actions/dashboard-setup-check', () => ({
  checkDashboardSetup: vi.fn(async () => ({ success: true, data: null })),
}));
vi.mock('@/lib/actions/invoice-actions/invoice-actions', () => ({
  getPaginatedInvoices: vi.fn(async () => ({ success: true, data: {} })),
}));
vi.mock('@/components/invoices', () => ({ InvoicesListContainer: () => null }));
vi.mock('@/components/dashboard/header/dashboard-header', () => ({ DashboardHeader: () => null }));
vi.mock('@/components/dashboard/dashboard-banners', () => ({ DashboardBanners: () => null }));
vi.mock('@/components/dashboard', () => ({
  DashboardStatsCardsSkeleton: () => null,
  DashboardChartSkeleton: () => null,
  DashboardDebtorsSkeleton: () => null,
  DashboardExpectedPaymentsSkeleton: () => null,
  DashboardSenderAccountsSkeleton: () => null,
  DashboardRecentInvoicesSkeleton: () => null,
}));
vi.mock('@/app/(protected)/dashboard/_sections', () => ({
  StatsSection: () => null,
  ChartSection: () => null,
  DebtorsSection: () => null,
  ExpectedPaymentsSection: () => null,
  SenderAccountsSection: () => null,
  RecentInvoicesSection: () => null,
}));

import DashboardPage from '@/app/(protected)/dashboard/page';
import InvoicesPage from '@/app/(protected)/invoices/page';
import { currentLocalMonth } from '@/lib/services/_shared/time-zone';

type AnyElement = ReactElement<{ children?: ReactNode } & Record<string, unknown>>;

function findAllByProp(node: ReactNode, prop: string): AnyElement[] {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap((child) => findAllByProp(child, prop));
  const el = node as AnyElement;
  const own = el.props && prop in el.props ? [el] : [];
  return [...own, ...findAllByProp(el.props?.children, prop)];
}

describe('pages build periods from the account time zone (F-05)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 2026-10-31 20:00 UTC: already 1 November in Auckland, still 31 October in Los Angeles.
    vi.setSystemTime(new Date('2026-10-31T20:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it("the dashboard's default 'this month' is the account zone's month, not the cookie zone's", async () => {
    const tree = await DashboardPage({ searchParams: Promise.resolve({}) });
    const ranged = findAllByProp(tree, 'appliedRange');
    const [start, endExclusive] = currentLocalMonth(SAVED_ZONE);

    // The header's instants and every section's local dates are the Assistant's this-month for
    // the saved zone.
    const header = ranged.find((el) => el.props.appliedRange instanceof Object && 'start' in (el.props.appliedRange as object));
    expect(header?.props.appliedRange).toEqual({ start, endExclusive });
    const sections = ranged.filter((el) => el !== header);
    expect(sections.length).toBeGreaterThan(0);
    for (const section of sections) {
      expect(section.props.appliedRange).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    }
    expect(currentLocalMonth(COOKIE_ZONE)[0]).not.toEqual(start);
  });

  it('the invoice list is given the account zone, not the cookie zone', async () => {
    const tree = await InvoicesPage({ searchParams: Promise.resolve({}) });
    expect((tree as AnyElement).props.timeZone).toBe(SAVED_ZONE);
  });
});
