// T06 (spec.md §5 AC-23, AC-23b, AC-24; ADR-0005, ADR-0008): every dashboard figure applies the shared
// overdue rule with "today" in the actor's zone, and the currency tabs are the union of bank-account
// and issued-invoice currencies.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../../support/db/container';
import { createTestPrismaClient } from '../../../support/db/client';
import { truncateAllTables } from '../../../support/db/truncate';
import { actingFreelancerForTest } from '../../../support/acting-freelancer';
import { KYIV, addInvoice, seedFreelancer } from './harness';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

let testClient: PrismaClient;
vi.mock('@/prisma', () => ({ prisma: new Proxy({}, { get: (_t, k) => (testClient as never)[k] }) }));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, unstable_cache: (fn: () => unknown) => fn }));

type Svc = typeof import('@/lib/services/dashboard/dashboard');

function data<T>(r: { success: true; data: T } | { success: false; code: string; error: string }): T {
  if (!r.success) throw new Error(`expected success, got ${r.code}: ${r.error}`);
  return r.data;
}

const at = (iso: string) => new Date(iso);

describe.runIf(containerRuntimeAvailable)('dashboard shared overdue rule (T06)', () => {
  let db: TestDatabase;
  let svc: Svc;

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

  afterEach(async () => {
    vi.useRealTimers();
    await truncateAllTables(testClient);
  });

  function clock(iso: string) {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(iso));
  }

  async function sections(actor: Awaited<ReturnType<typeof actingFreelancerForTest>>) {
    return {
      stats: data(await svc.getSummaryStats(actor, 'USD')),
      debtors: data(await svc.getDebtors(actor, 'USD')),
      expected: data(await svc.getExpectedPayments(actor, 'USD')),
      recent: data(await svc.getRecentInvoices(actor, 'USD')),
    };
  }

  it('AC-24: a past-due never-marked pending invoice is overdue everywhere on the dashboard', async () => {
    const s = await seedFreelancer(testClient, ['USD']);
    const inv = await addInvoice(s, {
      currency: 'USD',
      status: 'PENDING',
      total: 120.5,
      issueDate: at('2026-08-01T09:00:00Z'),
      dueDate: at('2026-08-15T00:00:00Z'),
    });
    clock('2026-09-10T12:00:00Z');
    const actor = await actingFreelancerForTest(s.userId, 'UTC');
    const r = await sections(actor);
    expect(r.stats).toMatchObject({ totalOverdue: 120.5, overdueCount: 1, totalPlanned: 0, plannedCount: 0 });
    expect(r.stats.allFuturePayments).toBe(120.5);
    expect(r.debtors.map((d) => [d.customerId, d.total, d.count])).toEqual([[s.customer.id, 120.5, 1]]);
    expect(r.expected).toEqual([]);
    expect(r.recent.find((i) => i.id === inv.id)?.status).toBe('OVERDUE');
    // T27 (F8): the row menu is built from the stored status, which travels beside the derived one.
    expect(r.recent.find((i) => i.id === inv.id)?.storedStatus).toBe('PENDING');
    const stored = await testClient.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(stored.status).toBe('PENDING');
  });

  it('keeps edge cases: due today planned, hand-marked overdue counted, paid never overdue', async () => {
    const s = await seedFreelancer(testClient, ['USD']);
    await addInvoice(s, { currency: 'USD', status: 'PENDING', total: 10, dueDate: at('2026-09-10T00:00:00Z') });
    await addInvoice(s, { currency: 'USD', status: 'OVERDUE', total: 20, dueDate: at('2026-09-20T00:00:00Z') });
    await addInvoice(s, { currency: 'USD', status: 'PAID', total: 40, issueDate: at('2026-08-01T00:00:00Z'), dueDate: at('2026-08-05T00:00:00Z') });
    clock('2026-09-10T12:00:00Z');
    const actor = await actingFreelancerForTest(s.userId, 'UTC');
    const r = await sections(actor);
    expect(r.stats).toMatchObject({ totalPlanned: 10, plannedCount: 1, totalOverdue: 20, overdueCount: 1, totalReceived: 40 });
    expect(r.expected[0].invoices.map((i) => i.total)).toEqual([10]);
    expect(r.debtors.map((d) => d.total)).toEqual([20]);
  });

  it('AC-23: Kyiv 00:30 on 1 October (still 30 September in UTC) uses the new month and counts the 30 September invoice overdue', async () => {
    const s = await seedFreelancer(testClient, ['USD']);
    await addInvoice(s, { currency: 'USD', status: 'PENDING', total: 75, issueDate: at('2026-09-01T09:00:00Z'), dueDate: at('2026-09-30T00:00:00Z') });
    clock('2026-09-30T21:30:00Z');
    const actor = await actingFreelancerForTest(s.userId, KYIV);
    const r = await sections(actor);
    expect(r.stats).toMatchObject({ totalOverdue: 75, overdueCount: 1, plannedCount: 0 });
    expect(r.debtors).toHaveLength(1);
    expect(r.expected).toEqual([]);
    const chart = data(await svc.getChartData(actor, 'USD'));
    expect(chart[0].date).toBe('2026-10-01');
    // The same instant for an actor in UTC: still September, the invoice is due today, not overdue.
    const utcActor = await actingFreelancerForTest(s.userId, 'UTC');
    expect((await sections(utcActor)).stats).toMatchObject({ overdueCount: 0, plannedCount: 1 });
  });

  it('AC-23b: New York 21:00 on 14 March (15 March in UTC) is not overdue; from 00:00 on 15 March it is', async () => {
    const s = await seedFreelancer(testClient, ['USD']);
    await addInvoice(s, { currency: 'USD', status: 'PENDING', total: 60, issueDate: at('2026-03-01T09:00:00Z'), dueDate: at('2026-03-14T00:00:00Z') });
    const actor = await actingFreelancerForTest(s.userId, 'America/New_York');

    clock('2026-03-15T01:00:00Z');
    const before = await sections(actor);
    expect(before.stats).toMatchObject({ overdueCount: 0, totalOverdue: 0, plannedCount: 1 });
    expect(before.debtors).toEqual([]);
    expect(before.expected[0].invoices).toHaveLength(1);
    expect(before.recent[0].status).toBe('PENDING');

    vi.setSystemTime(new Date('2026-03-15T04:00:00Z'));
    const after = await sections(actor);
    expect(after.stats).toMatchObject({ overdueCount: 1, totalOverdue: 60, plannedCount: 0 });
    expect(after.debtors).toHaveLength(1);
    expect(after.expected).toEqual([]);
    expect(after.recent[0].status).toBe('OVERDUE');
  });

  it('sender accounts planned sum and chart planned include a derived overdue invoice once', async () => {
    const s = await seedFreelancer(testClient, ['USD']);
    await addInvoice(s, { currency: 'USD', status: 'PENDING', total: 30, issueDate: at('2026-09-01T09:00:00Z'), dueDate: at('2026-09-05T00:00:00Z') });
    clock('2026-09-10T12:00:00Z');
    const actor = await actingFreelancerForTest(s.userId, 'UTC');
    const period = { from: '2026-09-01', to: '2026-09-30' };
    const senders = data(await svc.getSenderAccounts(actor, 'USD', period));
    expect(senders[0].totalPlanned).toBe(30);
    expect(senders[0].allFuturePlanned).toBe(30);
    const chart = data(await svc.getChartData(actor, 'USD', period));
    expect(chart[chart.length - 1].expected).toBe(0);
  });

  describe('currency tabs (ADR-0008)', () => {
    it('is the union of bank-account and issued-invoice currencies; drafts do not add a tab', async () => {
      const s = await seedFreelancer(testClient, ['USD']);
      await addInvoice(s, { currency: 'EUR', status: 'PENDING', total: 5 });
      await addInvoice(s, { currency: 'GBP', status: 'DRAFT', total: 5 });
      const actor = await actingFreelancerForTest(s.userId, 'UTC');
      expect(data(await svc.getCurrencyTabs(actor)).map((t) => t.currency)).toEqual(['USD', 'EUR']);
    });

    it('falls back to a single USD tab with nothing at all', async () => {
      const s = await seedFreelancer(testClient, []);
      const actor = await actingFreelancerForTest(s.userId, 'UTC');
      expect(data(await svc.getCurrencyTabs(actor)).map((t) => t.currency)).toEqual(['USD']);
    });
  });
});
