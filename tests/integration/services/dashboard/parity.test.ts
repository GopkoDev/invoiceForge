// T17/T18/T19 (spec.md §5 AC-05, AC-07; §6 Dashboard parity): the new owner-joined SQL functions
// produce, on the AC-05 fixture, the values the old in-memory dashboard actions produced. Since T19
// the old output is recorded as fixed expected values (recorded-values.ts) and the old code is gone,
// so this test compares only the new functions (sad.md §7 wave 4). Each query still reads no more
// rows than it displays (sad.md §10 QG-2, QG-4).
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../../support/db/container';
import { createTestPrismaClient } from '../../../support/db/client';
import { truncateAllTables } from '../../../support/db/truncate';
import { actingFreelancerForTest } from '../../../support/acting-freelancer';
import { FIXTURE_NOW, KYIV, createQueryRecorder, fixtureLabels, seedParityFixture, snapshotDashboard } from './harness';
import { RECORDED_OLD_DASHBOARD } from './recorded-values';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

let testClient: PrismaClient;
const recorder = createQueryRecorder(() => testClient);

vi.mock('@/prisma', () => ({ prisma: recorder.proxy }));
vi.mock('next/cache', () => ({
  revalidatePath: () => {},
  unstable_cache: (fn: () => unknown) => fn,
}));

type Actor = Awaited<ReturnType<typeof actingFreelancerForTest>>;
type Svc = typeof import('@/lib/services/dashboard/dashboard');

describe.runIf(containerRuntimeAvailable)('dashboard parity on recorded values (T19, AC-05, AC-07)', () => {
  let db: TestDatabase;
  let svc: Svc;
  let actor: Actor;

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    testClient = createTestPrismaClient(db.connectionString);
    svc = await import('@/lib/services/dashboard/dashboard');
  }, 60_000);

  afterAll(async () => {
    await testClient?.$disconnect();
    await db?.stop();
  });

  beforeEach(async () => {
    const s = await seedParityFixture(testClient);
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

  it('every section equals the recorded old output: amounts to the cent, counts, groups, listed invoices', async () => {
    const labels = await fixtureLabels(testClient);
    const snapshot = await snapshotDashboard({
      tabs: () => svc.getCurrencyTabs(actor),
      stats: (c, p) => svc.getSummaryStats(actor, c as 'USD', p),
      chart: (c, p) => svc.getChartData(actor, c as 'USD', p),
      senders: (c, p) => svc.getSenderAccounts(actor, c as 'USD', p),
      recent: (c) => svc.getRecentInvoices(actor, c as 'USD'),
      debtors: (c) => svc.getDebtors(actor, c as 'USD'),
      expected: (c) => svc.getExpectedPayments(actor, c as 'USD'),
    }, labels);
    expect(snapshot).toEqual(RECORDED_OLD_DASHBOARD);
  });

  it('the recorded values really cover the drift, the DST switch and the tied top three', () => {
    const rec = RECORDED_OLD_DASHBOARD as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(rec['USD.chart.dst']).toHaveLength(9);
    expect(rec['USD.debtors']).toHaveLength(3);
    expect(rec['USD.senders.all']).toHaveLength(2);
  });

  it('rows read never exceed the rows shown (summary: 1 row; recent: at most 10; debtors: at most 3)', async () => {
    recorder.reset();
    await svc.getSummaryStats(actor, 'USD', { from: '2026-03-25', to: '2026-04-02' });
    expect(recorder.rowCounts).toEqual([1]);
    recorder.reset();
    const debtors = await svc.getDebtors(actor, 'USD');
    expect(debtors.success && debtors.data.length).toBe(3);
    expect(recorder.rowCounts).toHaveLength(1);
    expect(recorder.rowCounts[0]).toBeLessThanOrEqual(3);
    recorder.reset();
    await svc.getRecentInvoices(actor, 'USD');
    expect(recorder.rowCounts[0]).toBeLessThanOrEqual(10);
  });

  it('float drift: 0.10 + 0.20 + 0.30 is exactly 0.60 in the new received total', async () => {
    const r = await svc.getSummaryStats(actor, 'USD', { from: '2026-03-25', to: '2026-03-29' });
    expect(r.success && r.data.totalReceived).toBe(0.6);
    expect(r.success && r.data.receivedCount).toBe(3);
  });
});
