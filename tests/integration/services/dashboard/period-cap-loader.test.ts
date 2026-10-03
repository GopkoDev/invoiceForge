// T28 (spec.md §5 AC-07, AC-08; review-2026-10-03 F-25) — the five-year rule through the dashboard
// loader: the page parses the link with dashboardParamsSchema and feeds `period` to the dashboard
// actions, which call the business layer. An over-long link falls back to the current month, the
// exact-5-year link is applied, and the link reader and business rule agree on the boundary in
// any zone and across a 29 February start.
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../../support/db/docker-availability';
import {
  startTestDatabase,
  type TestDatabase,
} from '../../../support/db/container';
import { createTestPrismaClient } from '../../../support/db/client';
import { truncateAllTables } from '../../../support/db/truncate';
import { addInvoice, seedFreelancer } from './harness';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

let testClient: PrismaClient;
vi.mock('@/prisma', () => ({
  prisma: new Proxy(
    {},
    {
      get: (_t, key) => {
        const c = testClient as unknown as Record<string | symbol, unknown>;
        const v = c[key];
        return typeof v === 'function'
          ? (v as (...a: unknown[]) => unknown).bind(c)
          : v;
      },
    }
  ),
}));

const authMock = vi.fn<() => Promise<{ user: { id: string } } | null>>();
vi.mock('@/auth', () => ({ auth: () => authMock() }));

const tzCookie = vi.hoisted(() => ({ value: 'UTC' }));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (n: string) => (n === 'tz' ? { value: tzCookie.value } : undefined),
  }),
}));
vi.mock('next/cache', () => ({
  revalidatePath: () => {},
  unstable_cache: (fn: unknown) => fn,
}));
vi.mock('@sentry/nextjs', () => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
  startSpan: (_o: unknown, cb: () => unknown) => cb(),
}));

type Period = { from: string; to: string };
type Res<T> =
  | { success: true; data: T }
  | { success: false; code: string; fieldErrors?: Record<string, string[]> };
type Actions = {
  getDashboardSummaryStats: (
    c: string,
    p?: Period
  ) => Promise<Res<{ receivedCount: number }>>;
  getDashboardChartData: (
    c: string,
    p?: Period
  ) => Promise<Res<{ date: string; paid: number }[]>>;
};

const NOW = new Date('2026-09-27T12:00:00.000Z');
const MONTH = { from: '2026-09-01', to: '2026-09-30' };
const ZONES = ['UTC', 'Pacific/Kiritimati', 'Pacific/Pago_Pago'];

describe.runIf(containerRuntimeAvailable)(
  'dashboard loader applies the five-year rule (T28, AC-07, AC-08)',
  () => {
    let db: TestDatabase;
    let actions: Actions;
    let parseLink: typeof import('@/lib/validations/search-params').dashboardParamsSchema;
    let seed: Awaited<ReturnType<typeof seedFreelancer>>;

    beforeAll(async () => {
      db = await startTestDatabase();
      process.env.DATABASE_URL = db.connectionString;
      vi.resetModules();
      testClient = createTestPrismaClient(db.connectionString);
      actions =
        (await import('@/lib/actions/dashboard-actions')) as unknown as Actions;
      ({ dashboardParamsSchema: parseLink } =
        await import('@/lib/validations/search-params'));
    }, 60_000);

    afterAll(async () => {
      await testClient?.$disconnect();
      await db?.stop();
    });

    beforeEach(async () => {
      seed = await seedFreelancer(testClient, ['USD']);
      authMock.mockResolvedValue({ user: { id: seed.userId } });
    });
    afterEach(async () => {
      authMock.mockReset();
      tzCookie.value = 'UTC';
      await truncateAllTables(testClient);
    });

    const paid = (total: number, iso: string) =>
      addInvoice(seed, {
        currency: 'USD',
        status: 'PAID',
        total,
        issueDate: new Date(iso),
        dueDate: new Date(iso),
      });
    // The chart's `paid` series is cumulative, so the paid total is its last point.
    const sum = (chart: { paid: number }[]) => chart.at(-1)?.paid ?? 0;

    /** What the dashboard page does: link params -> period -> stats and chart sections. */
    async function load(zone: string, link: Record<string, string>) {
      tzCookie.value = zone;
      const { period } = parseLink(zone, NOW).parse(link);
      const stats = await actions.getDashboardSummaryStats('USD', period);
      const chart = await actions.getDashboardChartData('USD', period);
      if (!stats.success || !chart.success)
        throw new Error('dashboard section failed');
      return { period, stats: stats.data, chart: chart.data };
    }

    it('an over-long link shows the current month, never a long day series (AC-07)', async () => {
      await paid(100, '2021-01-01T12:00:00Z');
      await paid(200, '2026-09-10T12:00:00Z');
      for (const link of [
        { from: '2021-01-01', to: '2026-01-02' },
        { from: '0100-01-01', to: '9999-12-31' },
      ]) {
        const r = await load('UTC', link);
        expect(r.period).toEqual(MONTH);
        expect(r.stats.receivedCount).toBe(1);
        expect(r.chart.length).toBeLessThanOrEqual(31);
        expect(sum(r.chart)).toBe(200);
      }
    });

    it.each(ZONES)(
      'applies exactly five years and falls back at five years and a day in %s (AC-08)',
      async (zone) => {
        await paid(100, '2021-01-01T12:00:00Z');
        await paid(200, '2026-09-10T12:00:00Z');

        const exact = await load(zone, {
          from: '2021-01-01',
          to: '2026-01-01',
        });
        expect(exact.period).toEqual({ from: '2021-01-01', to: '2026-01-01' });
        expect(exact.stats.receivedCount).toBe(1);
        expect(sum(exact.chart)).toBe(100);

        const longer = await load(zone, {
          from: '2021-01-01',
          to: '2026-01-02',
        });
        expect(longer.period).toEqual(
          (await load(zone, { from: 'abc', to: 'xyz' })).period
        );
        expect(longer.stats.receivedCount).toBe(1);
        expect(sum(longer.chart)).toBe(200);
      }
    );

    it.each(ZONES)(
      'a 29 February start counts to 28 February, in %s (AC-08)',
      async (zone) => {
        await paid(100, '2020-02-29T12:00:00Z');
        const ok = await load(zone, { from: '2020-02-29', to: '2025-02-28' });
        expect(ok.period).toEqual({ from: '2020-02-29', to: '2025-02-28' });
        expect(ok.stats.receivedCount).toBe(1);

        const over = await load(zone, { from: '2020-02-29', to: '2025-03-01' });
        expect(over.period).toEqual(MONTH);
        expect(over.stats.receivedCount).toBe(0);
      }
    );

    it.each([
      ['exact five years', { from: '2021-01-01', to: '2026-01-01' }, true],
      ['five years and a day', { from: '2021-01-01', to: '2026-01-02' }, false],
      ['leap start, in range', { from: '2020-02-29', to: '2025-02-28' }, true],
      [
        'leap start, a day over',
        { from: '2020-02-29', to: '2025-03-01' },
        false,
      ],
    ])(
      'link reader and business layer agree: %s (AC-08)',
      async (_n, period, allowed) => {
        const applied = parseLink('UTC', NOW).parse(period).period;
        expect(applied?.from === period.from && applied?.to === period.to).toBe(
          allowed
        );
        const res = await actions.getDashboardSummaryStats('USD', period);
        expect(res.success).toBe(allowed);
        if (!res.success) expect(res.fieldErrors?.period).toBeDefined();
      }
    );
  }
);
