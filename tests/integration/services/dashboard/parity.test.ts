// T17 (spec.md §5 AC-05, AC-07): the old in-memory dashboard actions and the new owner-joined SQL
// functions agree to the cent on the AC-05 fixture, and each query reads no more rows than it
// displays (sad.md §10 QG-2, QG-4). T18 adds the remaining sections to this same harness.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../../support/db/container';
import { createTestPrismaClient } from '../../../support/db/client';
import { truncateAllTables } from '../../../support/db/truncate';
import { actingFreelancerForTest } from '../../../support/acting-freelancer';
import {
  DST_PERIOD,
  FIXTURE_NOW,
  KYIV,
  WEEKLY_PERIOD,
  cents,
  createQueryRecorder,
  seedParityFixture,
} from './harness';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

let currentUserId = '';
let testClient: PrismaClient;
const recorder = createQueryRecorder(() => testClient);

vi.mock('@/prisma', () => ({ prisma: recorder.proxy }));
vi.mock('@/auth', () => ({ auth: async () => ({ user: { id: currentUserId } }) }));
vi.mock('next/cache', () => ({
  revalidatePath: () => {},
  unstable_cache: (fn: () => unknown) => fn,
}));

type Res<T> = { success: true; data: T } | { success: false; code: string; error: string };
type Stats = Record<
  | 'totalReceived'
  | 'receivedCount'
  | 'totalPlanned'
  | 'plannedCount'
  | 'totalOverdue'
  | 'overdueCount'
  | 'allFuturePayments'
  | 'allFuturePaymentsCount',
  number
>;
type Point = { date: string; paid: number; expected: number };
type Tab = { currency: string; label: string };
type Actor = Awaited<ReturnType<typeof actingFreelancerForTest>>;
type Period = { from: string; to: string };

type OldActions = {
  getDashboardCurrencyTabs: () => Promise<Res<Tab[]>>;
  getDashboardSummaryStats: (c: string, r?: { start: Date; endExclusive: Date }) => Promise<Res<Stats>>;
  getDashboardChartData: (c: string, r: { start: Date; endExclusive: Date }, tz: string) => Promise<Res<Point[]>>;
};
type NewService = {
  getCurrencyTabs: (a: Actor) => Promise<Res<Tab[]>>;
  getSummaryStats: (a: Actor, c: string, p?: Period) => Promise<Res<Stats>>;
  getChartData: (a: Actor, c: string, p?: Period) => Promise<Res<Point[]>>;
};

function unwrap<T>(r: Res<T>): T {
  if (!r.success) throw new Error(`expected success, got ${r.code}: ${r.error}`);
  return r.data;
}

describe.runIf(containerRuntimeAvailable)('dashboard parity, old vs new (T17, AC-05, AC-07)', () => {
  let db: TestDatabase;
  let old: OldActions;
  let svc: NewService;
  let actor: Actor;
  let range: (p: Period) => { start: Date; endExclusive: Date };

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    testClient = createTestPrismaClient(db.connectionString);
    old = (await import('@/lib/actions/dashboard-actions')) as unknown as OldActions;
    svc = (await import('@/lib/services/dashboard/dashboard')) as unknown as NewService;
    const tz = await import('@/lib/services/_shared/time-zone');
    range = (p) => {
      const [start, endExclusive] = tz.localDayRange(p.from, p.to, KYIV);
      return { start, endExclusive };
    };
  }, 60_000);

  afterAll(async () => {
    await testClient?.$disconnect();
    await db?.stop();
  });

  beforeEach(async () => {
    const s = await seedParityFixture(testClient);
    currentUserId = s.userId;
    actor = await actingFreelancerForTest(s.userId, KYIV);
    // Only Date is faked so the pg driver's timers keep running.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(FIXTURE_NOW);
    recorder.reset();
  });

  afterEach(async () => {
    vi.useRealTimers();
    await truncateAllTables(testClient);
  });

  it('currency tabs: same currencies, at most one row per currency', async () => {
    const before = unwrap(await old.getDashboardCurrencyTabs());
    recorder.reset();
    const after = unwrap(await svc.getCurrencyTabs(actor));
    const byCurrency = (t: Tab[]) => [...t].sort((a, b) => a.currency.localeCompare(b.currency));
    expect(byCurrency(after)).toEqual(byCurrency(before));
    expect(recorder.rowCounts).toHaveLength(1);
    expect(recorder.rowCounts[0]).toBeLessThanOrEqual(after.length);
  });

  it.each([
    ['DST period', DST_PERIOD],
    ['weekly period', WEEKLY_PERIOD],
  ])('summary stats over the %s: amounts to the cent, counts identical, 1 row', async (_n, period) => {
    for (const currency of ['USD', 'EUR']) {
      const before = unwrap(await old.getDashboardSummaryStats(currency, range(period)));
      recorder.reset();
      const after = unwrap(await svc.getSummaryStats(actor, currency, period));
      for (const key of ['totalReceived', 'totalPlanned', 'totalOverdue', 'allFuturePayments'] as const) {
        expect(cents(after[key]), `${currency} ${key}`).toBe(cents(before[key]));
      }
      for (const key of ['receivedCount', 'plannedCount', 'overdueCount', 'allFuturePaymentsCount'] as const) {
        expect(after[key], `${currency} ${key}`).toBe(before[key]);
      }
      expect(recorder.rowCounts).toEqual([1]);
    }
  });

  it('summary stats with no period (all time) equal the old appliedRange === undefined', async () => {
    const before = unwrap(await old.getDashboardSummaryStats('USD'));
    const after = unwrap(await svc.getSummaryStats(actor, 'USD'));
    expect(after.receivedCount).toBe(before.receivedCount);
    expect(cents(after.totalReceived)).toBe(cents(before.totalReceived));
    expect(cents(after.totalPlanned)).toBe(cents(before.totalPlanned));
    expect(cents(after.totalOverdue)).toBe(cents(before.totalOverdue));
  });

  it('float drift: 0.10 + 0.20 + 0.30 is exactly 0.60 in the new received total', async () => {
    const after = unwrap(await svc.getSummaryStats(actor, 'USD', { from: '2026-03-25', to: '2026-03-29' }));
    // 0.10 + 0.20 on 25 Mar, 0.30 at 00:30 on 29 Mar local.
    expect(after.totalReceived).toBe(0.6);
    expect(after.receivedCount).toBe(3);
  });

  it.each([
    ['DST period (daily)', DST_PERIOD],
    ['weekly period', WEEKLY_PERIOD],
  ])('chart over the %s: same days, amounts to the cent, rows <= points shown', async (_n, period) => {
    for (const currency of ['USD', 'EUR']) {
      const before = unwrap(await old.getDashboardChartData(currency, range(period), KYIV));
      recorder.reset();
      const after = unwrap(await svc.getChartData(actor, currency, period));
      expect(after.map((p) => p.date)).toEqual(before.map((p) => p.date));
      expect(after.map((p) => cents(p.paid))).toEqual(before.map((p) => cents(p.paid)));
      expect(after.map((p) => cents(p.expected))).toEqual(before.map((p) => cents(p.expected)));
      expect(recorder.rowCounts.length).toBeGreaterThan(0);
      for (const rows of recorder.rowCounts) expect(rows).toBeLessThanOrEqual(after.length);
    }
  });

  it('AC-07: a request-free actor receives the figures the page receives', async () => {
    // The page path is the old action under a session for the same user.
    const page = unwrap(await old.getDashboardSummaryStats('USD', range(DST_PERIOD)));
    const assistant = unwrap(await svc.getSummaryStats(actor, 'USD', DST_PERIOD));
    expect(cents(assistant.totalReceived)).toBe(cents(page.totalReceived));
    expect(assistant.receivedCount).toBe(page.receivedCount);
  });
});
