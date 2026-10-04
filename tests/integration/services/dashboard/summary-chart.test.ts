// T17 (spec.md §5 AC-21, AC-22, QG-1, QG-4): two-Freelancer isolation per dashboard query, the
// Kyiv 00:30 1 October invoice, the UTC fallback, VALIDATION, and rows read per query.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../../support/db/container';
import { createTestPrismaClient } from '../../../support/db/client';
import { truncateAllTables } from '../../../support/db/truncate';
import { actingFreelancerForTest } from '../../../support/acting-freelancer';
import { createBankAccount } from '../../../support/factories/bank-account';
import { KYIV, addInvoice, createQueryRecorder, seedFreelancer } from './harness';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

let testClient: PrismaClient;
const recorder = createQueryRecorder(() => testClient);
vi.mock('@/prisma', () => ({ prisma: recorder.proxy }));

type Actor = Awaited<ReturnType<typeof actingFreelancerForTest>>;
type Period = { from: string; to: string };
type Res<T = unknown> =
  | { success: true; data: T }
  | { success: false; code: string; error: string; fieldErrors?: Record<string, string[]> };
type Stats = {
  totalReceived: number;
  receivedCount: number;
  totalPlanned: number;
  plannedCount: number;
  totalOverdue: number;
  overdueCount: number;
  allFuturePayments: number;
  allFuturePaymentsCount: number;
};
type Point = { date: string; paid: number; expected: number };
type Service = {
  getCurrencyTabs: (a: Actor) => Promise<Res<{ currency: string }[]>>;
  getSummaryStats: (a: Actor, c: string, p?: Period) => Promise<Res<Stats>>;
  getChartData: (a: Actor, c: string, p?: Period) => Promise<Res<Point[]>>;
};

const SEPTEMBER: Period = { from: '2026-09-01', to: '2026-09-30' };
const PERIOD_MESSAGE = 'Give both dates as YYYY-MM-DD, with the start on or before the end.';

function data<T>(r: Res<T>): T {
  if (!r.success) throw new Error(`expected success, got ${r.code}: ${r.error}`);
  return r.data;
}

describe.runIf(containerRuntimeAvailable)('dashboard currency tabs, summary, chart (T17)', () => {
  let db: TestDatabase;
  let svc: Service;

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    testClient = createTestPrismaClient(db.connectionString);
    svc = (await import('@/lib/services/dashboard/dashboard')) as unknown as Service;
  }, 60_000);

  afterAll(async () => {
    await testClient?.$disconnect();
    await db?.stop();
  });

  beforeEach(() => recorder.reset());
  afterEach(async () => {
    vi.useRealTimers();
    await truncateAllTables(testClient);
  });

  async function twoFreelancers() {
    const a = await seedFreelancer(testClient, ['USD']);
    const b = await seedFreelancer(testClient, ['USD', 'EUR']);
    // ADR-0005: the pending invoices (due 12 September) stay pending only before that day.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-11T12:00:00Z'));
    const at = new Date('2026-09-10T09:00:00Z');
    await addInvoice(a, { currency: 'USD', status: 'PAID', total: 10, issueDate: at });
    await addInvoice(a, { currency: 'USD', status: 'PENDING', total: 20, issueDate: at, dueDate: new Date('2026-09-12T09:00:00Z') });
    await addInvoice(a, { currency: 'USD', status: 'OVERDUE', total: 30, issueDate: at, dueDate: new Date('2026-09-05T09:00:00Z') });
    await addInvoice(b, { currency: 'USD', status: 'PAID', total: 1000, issueDate: at });
    await addInvoice(b, { currency: 'USD', status: 'PENDING', total: 2000, issueDate: at, dueDate: new Date('2026-09-12T09:00:00Z') });
    await addInvoice(b, { currency: 'USD', status: 'OVERDUE', total: 3000, issueDate: at, dueDate: new Date('2026-09-05T09:00:00Z') });
    return { a, b, actor: await actingFreelancerForTest(a.userId, 'UTC') };
  }

  // T23 (review 2026-10-01 S-02): tabs keep the order the bank accounts were created in, because
  // the dashboard opens the first tab when the link has no ?currency=.
  describe('currency tab order (T23, S-02)', () => {
    it.each([
      [['USD', 'EUR'] as const],
      [['EUR', 'USD'] as const],
    ])('lists %j in creation order, one tab per currency', async (created) => {
      const s = await seedFreelancer(testClient, [...created]);
      await createBankAccount(testClient, s.profileId, { currency: created[0], isDefault: false });
      const actor = await actingFreelancerForTest(s.userId, 'UTC');
      expect(data(await svc.getCurrencyTabs(actor)).map((t) => t.currency)).toEqual([...created]);
    });
  });

  describe('two Freelancers (QG-1)', () => {
    it('getCurrencyTabs never includes B currencies', async () => {
      const { actor } = await twoFreelancers();
      expect(data(await svc.getCurrencyTabs(actor)).map((t) => t.currency)).toEqual(['USD']);
    });

    it('getSummaryStats never counts B invoices (with and without a period)', async () => {
      const { actor } = await twoFreelancers();
      for (const period of [undefined, SEPTEMBER]) {
        expect(data(await svc.getSummaryStats(actor, 'USD', period))).toEqual({
          totalReceived: 10,
          receivedCount: 1,
          totalPlanned: 20,
          plannedCount: 1,
          totalOverdue: 30,
          overdueCount: 1,
          allFuturePayments: 50,
          allFuturePaymentsCount: 2,
        });
      }
    });

    it('getChartData never includes B amounts', async () => {
      const { actor } = await twoFreelancers();
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-09-30T12:00:00Z'));
      const points = data(await svc.getChartData(actor, 'USD', SEPTEMBER));
      expect(Math.max(...points.map((p) => p.paid))).toBe(10);
      expect(Math.max(...points.map((p) => p.expected))).toBe(10);
    });
  });

  describe('time zones (AC-21, AC-22)', () => {
    async function boundaryInvoice() {
      const a = await seedFreelancer(testClient, ['USD']);
      // 00:30 on 1 October in Kyiv (UTC+3) is still 30 September 21:30 in UTC.
      await addInvoice(a, { currency: 'USD', status: 'PAID', total: 100, issueDate: new Date('2026-09-30T21:30:00Z') });
      return a;
    }

    it('AC-21: Kyiv 00:30 on 1 October does not count in September for Kyiv, and is in October', async () => {
      const a = await boundaryInvoice();
      const kyiv = await actingFreelancerForTest(a.userId, KYIV);
      expect(data(await svc.getSummaryStats(kyiv, 'USD', SEPTEMBER))).toMatchObject({ totalReceived: 0, receivedCount: 0 });
      expect(data(await svc.getSummaryStats(kyiv, 'USD', { from: '2026-10-01', to: '2026-10-31' }))).toMatchObject({
        totalReceived: 100,
        receivedCount: 1,
      });
    });

    it('AC-21: the chart puts that invoice on 1 October for Kyiv', async () => {
      const a = await boundaryInvoice();
      const kyiv = await actingFreelancerForTest(a.userId, KYIV);
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-10-20T12:00:00Z'));
      const points = data(await svc.getChartData(kyiv, 'USD', { from: '2026-09-28', to: '2026-10-03' }));
      const by = Object.fromEntries(points.map((p) => [p.date, p.paid]));
      expect(by['2026-09-30']).toBe(0);
      expect(by['2026-10-01']).toBe(100);
    });

    it.each([
      ['no time zone', undefined],
      ['an unknown time zone', 'Mars/Olympus_Mons'],
    ])('AC-22: %s falls back to UTC days and months', async (_n, tz) => {
      const a = await boundaryInvoice();
      const actor = await actingFreelancerForTest(a.userId, tz);
      // In UTC the invoice is 30 September.
      expect(data(await svc.getSummaryStats(actor, 'USD', SEPTEMBER))).toMatchObject({ totalReceived: 100, receivedCount: 1 });
      expect(data(await svc.getSummaryStats(actor, 'USD', { from: '2026-10-01', to: '2026-10-31' }))).toMatchObject({
        receivedCount: 0,
      });
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-10-20T12:00:00Z'));
      const points = data(await svc.getChartData(actor, 'USD', { from: '2026-09-28', to: '2026-10-03' }));
      expect(Object.fromEntries(points.map((p) => [p.date, p.paid]))['2026-09-30']).toBe(100);
    });
  });

  describe('validation', () => {
    it.each([
      ['reversed', { from: '2026-09-30', to: '2026-09-01' }],
      ['malformed', { from: '2026/09/01', to: '2026-09-30' }],
      ['not a real date', { from: '2026-02-30', to: '2026-03-05' }],
      ['one end missing', { from: '2026-09-01' }],
    ])('a %s period is VALIDATION with no query run', async (_n, period) => {
      const a = await seedFreelancer(testClient, ['USD']);
      const actor = await actingFreelancerForTest(a.userId, 'UTC');
      recorder.reset();
      for (const r of [
        await svc.getSummaryStats(actor, 'USD', period as Period),
        await svc.getChartData(actor, 'USD', period as Period),
      ]) {
        expect(r).toMatchObject({ success: false, code: 'VALIDATION' });
        expect((r as { fieldErrors?: Record<string, string[]> }).fieldErrors?.period).toEqual([PERIOD_MESSAGE]);
      }
      expect(recorder.rowCounts).toEqual([]);
    });

    it('an unknown currency is VALIDATION with fieldErrors.currency', async () => {
      const a = await seedFreelancer(testClient, ['USD']);
      const actor = await actingFreelancerForTest(a.userId, 'UTC');
      for (const r of [await svc.getSummaryStats(actor, 'XXX'), await svc.getChartData(actor, 'XXX')]) {
        expect(r).toMatchObject({ success: false, code: 'VALIDATION' });
        expect((r as { fieldErrors?: Record<string, string[]> }).fieldErrors?.currency).toEqual(['Unknown currency.']);
      }
    });
  });

  describe('rows read per query (QG-4)', () => {
    it('a Freelancer with no invoices gets empty figures and a USD default tab', async () => {
      const a = await seedFreelancer(testClient, []);
      const actor = await actingFreelancerForTest(a.userId, 'UTC');
      expect(data(await svc.getCurrencyTabs(actor))).toEqual([{ currency: 'USD', label: 'USD' }]);
      expect(data(await svc.getSummaryStats(actor, 'USD'))).toEqual({
        totalReceived: 0,
        receivedCount: 0,
        totalPlanned: 0,
        plannedCount: 0,
        totalOverdue: 0,
        overdueCount: 0,
        allFuturePayments: 0,
        allFuturePaymentsCount: 0,
      });
    });

    it('60 invoices on 3 days still read at most one row per chart point, 1 per stats', async () => {
      const a = await seedFreelancer(testClient, ['USD', 'EUR']);
      for (let i = 0; i < 60; i += 1) {
        await addInvoice(a, {
          currency: 'USD',
          status: i % 2 ? 'PAID' : 'PENDING',
          total: 1.11,
          issueDate: new Date(`2026-09-${String(10 + (i % 3)).padStart(2, '0')}T09:00:00Z`),
          dueDate: new Date(`2026-09-${String(20 + (i % 3)).padStart(2, '0')}T09:00:00Z`),
        });
      }
      const actor = await actingFreelancerForTest(a.userId, 'UTC');

      recorder.reset();
      const tabs = data(await svc.getCurrencyTabs(actor));
      expect(recorder.rowCounts.every((n) => n <= tabs.length)).toBe(true);

      recorder.reset();
      data(await svc.getSummaryStats(actor, 'USD', SEPTEMBER));
      expect(recorder.rowCounts).toEqual([1]);

      recorder.reset();
      const points = data(await svc.getChartData(actor, 'USD', SEPTEMBER));
      expect(recorder.rowCounts.length).toBeGreaterThan(0);
      for (const n of recorder.rowCounts) expect(n).toBeLessThanOrEqual(points.length);
    });
  });
});
