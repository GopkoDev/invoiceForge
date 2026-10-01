// T5 (service-layer; spec.md §6 NFR "Dashboard load latency p95", sad.md §7 Latency) — each of
// the seven dashboard actions runs inside a Sentry span named `dashboard.<section>` and returns
// the inner result unchanged.
import { beforeEach, describe, expect, it, vi } from 'vitest';

// T19: the spans live in lib/services/dashboard now; the wrappers resolve the session actor and
// delegate, so the data-store queries underneath are stubbed instead of prisma.
vi.mock('@/lib/helpers/session-actor', () => ({
  actingFreelancerFromSession: async () => ({
    success: true,
    data: { userId: 'user-1', timeZone: 'UTC' },
  }),
}));
vi.mock('@/lib/services/dashboard/queries', () => ({
  queryCurrencyTabs: async () => [],
  querySummaryStats: async () => ({
    totalReceived: 0,
    receivedCount: 0,
    totalPlanned: 0,
    plannedCount: 0,
    totalOverdue: 0,
    overdueCount: 0,
    allFuturePayments: 0,
    allFuturePaymentsCount: 0,
  }),
  queryChartBuckets: async () => [],
  querySenderAccounts: async () => [],
  queryRecentInvoices: async () => [],
  queryDebtors: async () => [],
  queryExpectedPayments: async () => [],
}));
vi.mock('next/cache', () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
  unstable_cache: (fn: unknown) => fn,
}));

const startSpanMock = vi.fn();
vi.mock('@sentry/nextjs', () => ({
  captureException: () => {},
  startSpan: (options: unknown, callback: () => unknown) => {
    startSpanMock(options);
    return callback();
  },
}));

type Actions = typeof import('@/lib/actions/dashboard-actions');

const cases: Array<[string, (a: Actions) => Promise<unknown>]> = [
  ['currency-tabs', (a) => a.getDashboardCurrencyTabs()],
  ['summary-stats', (a) => a.getDashboardSummaryStats('USD')],
  ['chart', (a) => a.getDashboardChartData('USD')],
  ['sender-accounts', (a) => a.getDashboardSenderAccounts('USD')],
  ['recent-invoices', (a) => a.getDashboardRecentInvoices('USD')],
  ['debtors', (a) => a.getDashboardDebtors('USD')],
  ['expected-payments', (a) => a.getDashboardExpectedPayments('USD')],
];

describe('dashboard actions run inside dashboard.<section> Sentry spans', () => {
  beforeEach(() => startSpanMock.mockClear());

  it.each(cases)('dashboard.%s span wraps the action once', async (section, run) => {
    const actions = await import('@/lib/actions/dashboard-actions');
    const result = (await run(actions)) as { success: boolean };

    expect(result.success).toBe(true);
    expect(startSpanMock).toHaveBeenCalledTimes(1);
    expect(startSpanMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: `dashboard.${section}` }),
    );
  });
});
