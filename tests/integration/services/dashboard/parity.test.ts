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

type Account = { accountId: string; received: number; planned: number };
type Sender = {
  senderProfileId: string;
  totalReceived: number;
  totalPlanned: number;
  allFuturePlanned: number;
  accounts: Account[];
};
type Recent = { id: string; invoiceNumber: string; status: string; total: number; currency: string; issueDate: Date; dueDate: Date };
type Debtor = { customerId: string; total: number; count: number; currencies: string[] };
type ExpectedItem = { id: string; invoiceNumber: string; total: number; dueDate: Date };
type ExpectedGroup = { currency: string; invoices: ExpectedItem[]; total: number; count: number };

type OldActions = {
  getDashboardSenderAccounts: (c: string, r?: { start: Date; endExclusive: Date }) => Promise<Res<Sender[]>>;
  getDashboardRecentInvoices: (c: string) => Promise<Res<Recent[]>>;
  getDashboardDebtors: (c: string) => Promise<Res<Debtor[]>>;
  getDashboardExpectedPayments: (c: string) => Promise<Res<ExpectedGroup[]>>;
  getDashboardCurrencyTabs: () => Promise<Res<Tab[]>>;
  getDashboardSummaryStats: (c: string, r?: { start: Date; endExclusive: Date }) => Promise<Res<Stats>>;
  getDashboardChartData: (c: string, r: { start: Date; endExclusive: Date }, tz: string) => Promise<Res<Point[]>>;
};
type NewService = {
  getSenderAccounts: (a: Actor, c: string, p?: Period) => Promise<Res<Sender[]>>;
  getRecentInvoices: (a: Actor, c: string) => Promise<Res<Recent[]>>;
  getDebtors: (a: Actor, c: string) => Promise<Res<Debtor[]>>;
  getExpectedPayments: (a: Actor, c: string) => Promise<Res<ExpectedGroup[]>>;
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

  // ---- T18 sections. Names, tie order and sender-accounts order are NOT compared (AC-05). ----

  it.each([
    ['DST period', DST_PERIOD],
    ['weekly period', WEEKLY_PERIOD],
    ['no period', undefined],
  ])('sender accounts, %s: same profiles and accounts, amounts to the cent, rows <= accounts shown', async (_n, period) => {
    const byId = <T extends { senderProfileId?: string; accountId?: string }>(l: T[], k: 'senderProfileId' | 'accountId') =>
      [...l].sort((a, b) => String(a[k]).localeCompare(String(b[k])));
    for (const currency of ['USD', 'EUR']) {
      const before = unwrap(await old.getDashboardSenderAccounts(currency, period ? range(period) : undefined));
      recorder.reset();
      const after = unwrap(await svc.getSenderAccounts(actor, currency, period));
      const strip = (l: Sender[]) =>
        byId(l, 'senderProfileId').map((s) => ({
          id: s.senderProfileId,
          received: cents(s.totalReceived),
          planned: cents(s.totalPlanned),
          future: cents(s.allFuturePlanned),
          accounts: byId(s.accounts, 'accountId').map((a) => [a.accountId, cents(a.received), cents(a.planned)]),
        }));
      expect(strip(after), currency).toEqual(strip(before));
      const shown = after.reduce((n, s) => n + s.accounts.length, 0);
      expect(recorder.rowCounts.length).toBeGreaterThan(0);
      for (const rows of recorder.rowCounts) expect(rows).toBeLessThanOrEqual(shown);
    }
    // The fixture really has two profiles in USD (all time; profile 2's only invoice is outside DST_PERIOD).
    expect(unwrap(await svc.getSenderAccounts(actor, 'USD'))).toHaveLength(2);
  });

  it('recent invoices: the same invoices, amounts to the cent, rows <= 10', async () => {
    for (const currency of ['USD', 'EUR']) {
      const before = unwrap(await old.getDashboardRecentInvoices(currency));
      recorder.reset();
      const after = unwrap(await svc.getRecentInvoices(actor, currency));
      const pick = (l: Recent[]) => l.map((i) => [i.id, i.invoiceNumber, i.status, cents(i.total), i.currency, +i.issueDate, +i.dueDate]);
      expect(pick(after), currency).toEqual(pick(before));
      expect(recorder.rowCounts).toHaveLength(1);
      expect(recorder.rowCounts[0]).toBeLessThanOrEqual(Math.max(after.length, 0));
    }
    expect(unwrap(await svc.getRecentInvoices(actor, 'USD')).length).toBeGreaterThan(3);
  });

  it('debtors: same totals, counts, currencies and members above the cut-off; 3 rows at most', async () => {
    const before = unwrap(await old.getDashboardDebtors('USD'));
    recorder.reset();
    const after = unwrap(await svc.getDebtors(actor, 'USD'));
    expect(after).toHaveLength(3);
    expect(after.map((x) => cents(x.total))).toEqual(before.map((x) => cents(x.total)));
    expect(after.map((x) => x.count)).toEqual(before.map((x) => x.count));
    expect(after.map((x) => x.currencies)).toEqual(before.map((x) => x.currencies));
    // Places 1 and 2 are untied: same customers. Place 3 is a tie (30 vs 30), which is not compared.
    expect(after.slice(0, 2).map((x) => x.customerId)).toEqual(before.slice(0, 2).map((x) => x.customerId));
    expect(recorder.rowCounts).toHaveLength(1);
    expect(recorder.rowCounts[0]).toBeLessThanOrEqual(3);
    // EUR has a single overdue invoice, hence a single Debtor.
    expect(unwrap(await svc.getDebtors(actor, 'EUR'))).toHaveLength(1);
  });

  it('expected payments: same groups, totals, counts and the same earliest invoices; rows <= invoices shown', async () => {
    for (const currency of ['USD', 'EUR']) {
      const before = unwrap(await old.getDashboardExpectedPayments(currency));
      recorder.reset();
      const after = unwrap(await svc.getExpectedPayments(actor, currency));
      const pick = (l: ExpectedGroup[]) =>
        l.map((g) => ({
          currency: g.currency,
          total: cents(g.total),
          count: g.count,
          invoices: g.invoices.map((i) => [i.id, i.invoiceNumber, cents(i.total), +i.dueDate]),
        }));
      expect(pick(after), currency).toEqual(pick(before));
      const shown = after.reduce((n, g) => n + g.invoices.length, 0);
      expect(recorder.rowCounts.length).toBeGreaterThan(0);
      for (const rows of recorder.rowCounts) expect(rows).toBeLessThanOrEqual(shown);
    }
    const usd = unwrap(await svc.getExpectedPayments(actor, 'USD'));
    expect(usd[0].invoices).toHaveLength(3);
    expect(usd[0].count).toBeGreaterThan(3);
  });

  it('AC-07: a request-free actor receives the figures the page receives', async () => {
    // The page path is the old action under a session for the same user.
    const page = unwrap(await old.getDashboardSummaryStats('USD', range(DST_PERIOD)));
    const assistant = unwrap(await svc.getSummaryStats(actor, 'USD', DST_PERIOD));
    expect(cents(assistant.totalReceived)).toBe(cents(page.totalReceived));
    expect(assistant.receivedCount).toBe(page.receivedCount);
  });
});
