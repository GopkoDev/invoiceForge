// T43 (spec.md §5 AC-28; review-2026-09-28.md N-10) — a FAILED result from ANY action module
// reports its cause to error monitoring exactly once. product, custom-price, bank-account,
// dashboard, profile and dashboard-setup-check returned a bare fail('FAILED') with no
// captureException. Every underlying prisma call rejects here.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/prisma', () => ({
  prisma: new Proxy(
    {},
    {
      get: () => {
        throw new Error('db down');
      },
    },
  ),
}));
vi.mock('@/lib/helpers/auth-helpers', () => ({
  getAuthenticatedUser: async () => ({ success: true, data: { userId: 'user-1' } }),
}));
vi.mock('@/auth', () => ({ auth: async () => ({ user: { id: 'user-1' } }) }));
vi.mock('next/cache', () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
  // T49 R-09: without unstable_cache the dashboard case failed on the mock's "no export
  // defined" error instead of reaching the rejecting prisma proxy.
  unstable_cache: (fn: unknown) => fn,
}));

// getPaginatedInvoices reads the time-zone cookie first, which needs a request scope.
vi.mock('@/lib/helpers/time-zone', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/helpers/time-zone')>()),
  getRequestTimeZone: async () => 'UTC',
}));

const captureExceptionMock = vi.fn();
vi.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => captureExceptionMock(...args),
  // T5: dashboard actions run inside a span; pass the callback straight through.
  startSpan: (_options: unknown, callback: () => unknown) => callback(),
}));

const cases: Array<[string, () => Promise<{ success: boolean; code?: string }>]> = [
  ['product', async () => (await import('@/lib/actions/product-actions')).getProducts()],
  [
    'custom-price',
    async () =>
      (await import('@/lib/actions/custom-price-actions')).getCustomerCustomPrices('c1'),
  ],
  [
    'bank-account',
    async () => (await import('@/lib/actions/bank-account-actions')).getBankAccounts('s1'),
  ],
  [
    'dashboard',
    async () => (await import('@/lib/actions/dashboard-actions')).getDashboardCurrencyTabs(),
  ],
  [
    'dashboard-setup-check',
    async () => (await import('@/lib/actions/dashboard-setup-check')).checkDashboardSetup(),
  ],
  // T55 S-04 (test-plan.md AC-28): every loader of the nine AC-28 pages, not one per module.
  ['product (by id)', async () => (await import('@/lib/actions/product-actions')).getProduct('p1')],
  [
    'product custom prices',
    async () => (await import('@/lib/actions/custom-price-actions')).getProductCustomPrices('p1'),
  ],
  ['customers', async () => (await import('@/lib/actions/customer-actions')).getCustomers()],
  ['customer (by id)', async () => (await import('@/lib/actions/customer-actions')).getCustomer('c1')],
  [
    'sender profiles',
    async () => (await import('@/lib/actions/sender-profile-actions')).getSenderProfiles(),
  ],
  [
    'sender profile (by id)',
    async () => (await import('@/lib/actions/sender-profile-actions')).getSenderProfile('s1'),
  ],
  [
    'invoice editor data',
    async () =>
      (await import('@/lib/actions/invoice-actions/invoice-actions')).getInvoiceEditorData('i1'),
  ],
  ['invoice', async () => (await import('@/lib/actions/invoice-actions/invoice-actions')).getInvoice('i1')],
  [
    'invoices by customer',
    async () =>
      (await import('@/lib/actions/invoice-actions/invoice-actions')).getInvoicesByCustomer('c1'),
  ],
  [
    'invoices by sender profile',
    async () =>
      (await import('@/lib/actions/invoice-actions/invoice-actions')).getInvoicesBySenderProfile('s1'),
  ],
  [
    'paginated invoices',
    async () =>
      (await import('@/lib/actions/invoice-actions/invoice-actions')).getPaginatedInvoices({}),
  ],
  [
    'dashboard summary stats',
    async () => (await import('@/lib/actions/dashboard-actions')).getDashboardSummaryStats('USD'),
  ],
  [
    'dashboard chart data',
    async () => (await import('@/lib/actions/dashboard-actions')).getDashboardChartData('USD'),
  ],
  [
    'dashboard sender accounts',
    async () => (await import('@/lib/actions/dashboard-actions')).getDashboardSenderAccounts('USD'),
  ],
  [
    'dashboard recent invoices',
    async () => (await import('@/lib/actions/dashboard-actions')).getDashboardRecentInvoices('USD'),
  ],
  [
    'dashboard debtors',
    async () => (await import('@/lib/actions/dashboard-actions')).getDashboardDebtors('USD'),
  ],
  [
    'dashboard expected payments',
    async () =>
      (await import('@/lib/actions/dashboard-actions')).getDashboardExpectedPayments('USD'),
  ],
  [
    'profile',
    async () =>
      (await import('@/lib/actions/profile-actions')).updateProfile({
        name: 'A',
        email: 'a@example.com',
      } as never),
  ],
];

describe('every action module reports a FAILED cause once (T43, N-10, AC-28)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    captureExceptionMock.mockClear();
  });

  it.each(cases)('%s', async (_name, run) => {
    const result = await run();
    // the cause must be the prisma rejection, not a mock-setup error (T49 R-09)
    expect(String(captureExceptionMock.mock.calls[0]?.[0])).toContain('db down');

    expect(result.code).toBe('FAILED');
    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
  });
});
