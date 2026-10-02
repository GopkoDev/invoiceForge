// T19 (service-layer; spec.md §5 AC-01; contracts/public-api.md §2.7 + §3) — the seven dashboard
// actions are thin wrappers: actingFreelancerFromSession() first (UNAUTHORIZED returned, no business
// function called), then the lib/services/dashboard function, result returned untouched. The wrapper
// holds no data-store import and no Sentry reporting.
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const actor = { userId: 'user-1', timeZone: 'Europe/Kyiv' };
const sessionMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/helpers/session-actor', () => ({ actingFreelancerFromSession: () => sessionMock() }));

const svc = vi.hoisted(() => ({
  getCurrencyTabs: vi.fn(),
  getSummaryStats: vi.fn(),
  getChartData: vi.fn(),
  getSenderAccounts: vi.fn(),
  getRecentInvoices: vi.fn(),
  getDebtors: vi.fn(),
  getExpectedPayments: vi.fn(),
}));
vi.mock('@/lib/services/dashboard/dashboard', () => svc);

const cacheOptions = vi.hoisted(() => [] as unknown[]);
vi.mock('next/cache', () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
  unstable_cache: (fn: unknown, _keys: unknown, options: unknown) => {
    cacheOptions.push(options);
    return fn;
  },
}));
vi.mock('@/prisma', () => ({
  prisma: new Proxy(
    {},
    {
      get: () => {
        throw new Error('wrapper must not touch prisma');
      },
    },
  ),
}));
const captureException = vi.hoisted(() => vi.fn());
vi.mock('@sentry/nextjs', () => ({
  captureException: (...a: unknown[]) => captureException(...a),
  captureMessage: vi.fn(),
  startSpan: (_o: unknown, cb: () => unknown) => cb(),
}));

const period = { from: '2026-09-01', to: '2026-09-30' };
type Actions = typeof import('@/lib/actions/dashboard-actions');
type Call = (a: Actions) => Promise<unknown>;
const cases: Array<[string, keyof typeof svc, Call, unknown[]]> = [
  ['getDashboardCurrencyTabs', 'getCurrencyTabs', (a) => a.getDashboardCurrencyTabs(), []],
  ['getDashboardSummaryStats', 'getSummaryStats', (a) => a.getDashboardSummaryStats('USD', period), ['USD', period]],
  ['getDashboardChartData', 'getChartData', (a) => a.getDashboardChartData('USD', period), ['USD', period]],
  ['getDashboardSenderAccounts', 'getSenderAccounts', (a) => a.getDashboardSenderAccounts('USD', period), ['USD', period]],
  ['getDashboardRecentInvoices', 'getRecentInvoices', (a) => a.getDashboardRecentInvoices('USD'), ['USD']],
  ['getDashboardDebtors', 'getDebtors', (a) => a.getDashboardDebtors('USD'), ['USD']],
  ['getDashboardExpectedPayments', 'getExpectedPayments', (a) => a.getDashboardExpectedPayments('USD'), ['USD']],
];

describe('dashboard wrappers delegate to lib/services/dashboard (T19, AC-01)', () => {
  beforeEach(() => {
    sessionMock.mockReset();
    captureException.mockReset();
    Object.values(svc).forEach((f) => f.mockReset());
  });

  it.each(cases)('%s: session actor first, then the layer function, result untouched', async (_n, fn, run, args) => {
    sessionMock.mockResolvedValue({ success: true, data: actor });
    const result = { success: true, data: { marker: fn } };
    svc[fn].mockResolvedValue(result);
    const actions = await import('@/lib/actions/dashboard-actions');
    expect(await run(actions)).toBe(result);
    expect(svc[fn]).toHaveBeenCalledWith(actor, ...args);
  });

  it.each(cases)('%s: UNAUTHORIZED is returned and no business function is called', async (_n, _fn, run) => {
    const unauthorized = { success: false, code: 'UNAUTHORIZED', error: 'Unauthorized' };
    sessionMock.mockResolvedValue(unauthorized);
    const actions = await import('@/lib/actions/dashboard-actions');
    expect(await run(actions)).toEqual(unauthorized);
    for (const f of Object.values(svc)) expect(f).not.toHaveBeenCalled();
  });

  it.each(cases)('%s: a FAILED result passes through with no second Sentry report', async (_n, fn, run) => {
    sessionMock.mockResolvedValue({ success: true, data: actor });
    const failedResult = { success: false, code: 'FAILED', error: 'boom' };
    svc[fn].mockResolvedValue(failedResult);
    const actions = await import('@/lib/actions/dashboard-actions');
    expect(await run(actions)).toBe(failedResult);
    expect(captureException).not.toHaveBeenCalled();
  });

  it('currency tabs stay in unstable_cache for 60 s with the dashboard tags', async () => {
    sessionMock.mockResolvedValue({ success: true, data: actor });
    svc.getCurrencyTabs.mockResolvedValue({ success: true, data: [] });
    const actions = await import('@/lib/actions/dashboard-actions');
    await actions.getDashboardCurrencyTabs();
    expect(cacheOptions).toContainEqual(
      expect.objectContaining({
        revalidate: 60,
        tags: expect.arrayContaining(['dashboard-currency-tabs', 'dashboard']),
      }),
    );
  });

  it('the wrapper file has no prisma import and no in-memory leftovers', () => {
    const src = readFileSync('lib/actions/dashboard-actions.ts', 'utf8');
    expect(src).not.toMatch(/from ['"]@\/prisma['"]/);
    expect(src).not.toMatch(/_fetchCurrencyTabs/);
  });
});
