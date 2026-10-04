// T14 (spec.md §5 AC-12, AC-13, AC-18, AC-18b): strictly paged overdue invoices and Debtors with
// totals over every match, agreeing with the dashboard's getDebtors.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../../support/db/container';
import { createTestPrismaClient } from '../../../support/db/client';
import { truncateAllTables } from '../../../support/db/truncate';
import { actingFreelancerForTest } from '../../../support/acting-freelancer';
import { createCustomer } from '../../../support/factories/customer';
import { KYIV, addInvoice, seedFreelancer } from './harness';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

let testClient: PrismaClient;
vi.mock('@/prisma', () => ({ prisma: new Proxy({}, { get: (_t, k) => (testClient as never)[k] }) }));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, unstable_cache: (fn: () => unknown) => fn }));

type Reads = typeof import('@/lib/services/dashboard/assistant-reads');
type Dash = typeof import('@/lib/services/dashboard/dashboard');

function data<T>(r: { success: true; data: T } | { success: false; code: string; error: string }): T {
  if (!r.success) throw new Error(`expected success, got ${r.code}: ${r.error}`);
  return r.data;
}

const at = (iso: string) => new Date(iso);

describe.runIf(containerRuntimeAvailable)('Assistant overdue invoices and Debtors (T14)', () => {
  let db: TestDatabase;
  let reads: Reads;
  let dash: Dash;

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    testClient = createTestPrismaClient(db.connectionString);
    reads = await import('@/lib/services/dashboard/assistant-reads');
    dash = await import('@/lib/services/dashboard/dashboard');
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

  it('AC-12: lists the never-marked past-due and the hand-marked invoices, with days overdue and totals', async () => {
    clock('2026-08-10T10:00:00Z'); // 13:00 on 10 Aug in Kyiv
    const s = await seedFreelancer(testClient, ['USD']);
    const yesterday = await addInvoice(s, { currency: 'USD', status: 'PENDING', total: 100.1, dueDate: at('2026-08-09T00:00:00Z') });
    const manual = await addInvoice(s, { currency: 'USD', status: 'OVERDUE', total: 200.2, dueDate: at('2026-08-20T00:00:00Z') });
    await addInvoice(s, { currency: 'USD', status: 'PENDING', total: 50, dueDate: at('2026-08-11T00:00:00Z') });
    const actor = await actingFreelancerForTest(s.userId, KYIV);

    const res = data(await reads.listOverdueInvoices(actor, { pageSize: 1 }));

    expect(res.today).toBe('2026-08-10');
    expect(res.timeZone).toBe(KYIV);
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]).toMatchObject({
      invoiceId: yesterday.id,
      invoiceNumber: yesterday.invoiceNumber,
      senderProfile: { senderProfileId: s.profileId, name: s.profile.name },
      customer: { customerId: s.customer.id },
      status: 'overdue',
      amount: '100.10',
      currency: 'USD',
      dueDate: '2026-08-09',
      daysOverdue: 1,
    });
    // totals cover every overdue invoice, not only the one row on the page
    expect(res.totals).toEqual([{ currency: 'USD', total: '300.30', count: 2 }]);
    expect(res.pageInfo).toMatchObject({ page: 1, pageSize: 1, total: 2, totalPages: 2, hasMore: true });

    const page2 = data(await reads.listOverdueInvoices(actor, { page: 2, pageSize: 1 }));
    expect(page2.rows[0]).toMatchObject({ invoiceId: manual.id, daysOverdue: 0, dueDate: '2026-08-20' });
  });

  it('currency filter limits rows and totals; no overdue invoices is an empty page 1, not an error', async () => {
    clock('2026-08-10T10:00:00Z');
    const s = await seedFreelancer(testClient, ['USD', 'EUR']);
    const actor = await actingFreelancerForTest(s.userId, KYIV);
    const empty = data(await reads.listOverdueInvoices(actor));
    expect(empty.rows).toEqual([]);
    expect(empty.totals).toEqual([]);
    expect(empty.pageInfo).toMatchObject({ page: 1, total: 0, hasMore: false });

    await addInvoice(s, { currency: 'USD', status: 'OVERDUE', total: 10, dueDate: at('2026-08-01T00:00:00Z') });
    await addInvoice(s, { currency: 'EUR', status: 'OVERDUE', total: 20, dueDate: at('2026-08-02T00:00:00Z') });
    const eur = data(await reads.listOverdueInvoices(actor, { currency: 'EUR' }));
    expect(eur.rows.map((r) => r.currency)).toEqual(['EUR']);
    expect(eur.totals).toEqual([{ currency: 'EUR', total: '20.00', count: 1 }]);
  });

  it('AC-18: pageSize 1000 returns at most 50 rows, says it was capped, totals unchanged', async () => {
    clock('2026-08-10T10:00:00Z');
    const s = await seedFreelancer(testClient, ['USD']);
    for (let n = 0; n < 53; n += 1) {
      await addInvoice(s, { currency: 'USD', status: 'OVERDUE', total: 1, dueDate: at('2026-08-01T00:00:00Z') });
    }
    const actor = await actingFreelancerForTest(s.userId, KYIV);
    const res = data(await reads.listOverdueInvoices(actor, { pageSize: 1000 }));
    expect(res.rows).toHaveLength(50);
    expect(res.pageInfo).toMatchObject({ pageSize: 50, pageSizeCapped: true, total: 53, totalPages: 2, hasMore: true });
    expect(res.totals).toEqual([{ currency: 'USD', total: '53.00', count: 53 }]);
  });

  it('AC-18b: page 7 of 3 is NOT_FOUND with total and last page, never an earlier page', async () => {
    clock('2026-08-10T10:00:00Z');
    const s = await seedFreelancer(testClient, ['USD']);
    for (let n = 0; n < 5; n += 1) {
      await addInvoice(s, { currency: 'USD', status: 'OVERDUE', total: 1, dueDate: at('2026-08-01T00:00:00Z') });
    }
    const actor = await actingFreelancerForTest(s.userId, KYIV);
    const res = await reads.listOverdueInvoices(actor, { page: 7, pageSize: 2 });
    expect(res).toMatchObject({
      success: false,
      code: 'NOT_FOUND',
      details: { kind: 'PAGE_OUT_OF_RANGE', total: 5, lastPage: 3 },
    });
    const debtors = await reads.listDebtorsPage(actor, { page: 7, pageSize: 2 });
    expect(debtors).toMatchObject({ success: false, code: 'NOT_FOUND', details: { kind: 'PAGE_OUT_OF_RANGE', total: 1, lastPage: 1 } });
  });

  it('rejects an invalid page or currency as VALIDATION', async () => {
    const s = await seedFreelancer(testClient, ['USD']);
    const actor = await actingFreelancerForTest(s.userId, KYIV);
    expect(await reads.listOverdueInvoices(actor, { page: 0 })).toMatchObject({ success: false, code: 'VALIDATION' });
    expect(await reads.listDebtorsPage(actor, { currency: 'XXX' as never })).toMatchObject({ success: false, code: 'VALIDATION' });
  });

  it('AC-13: returns every Debtor across pages, ranked per currency, agreeing with getDebtors', async () => {
    clock('2026-08-10T10:00:00Z');
    const s = await seedFreelancer(testClient, ['USD', 'EUR']);
    const customers = [s.customer];
    for (let n = 2; n <= 9; n += 1) customers.push(await createCustomer(testClient, s.userId, { name: `${n} Customer` }));
    // 9 Customers owe in USD (amounts 10..90, with one tie); the first two also owe in EUR.
    const usd = [90, 80, 70, 60, 50, 40, 30, 30, 10];
    for (let n = 0; n < 9; n += 1) {
      await addInvoice(s, { currency: 'USD', status: 'OVERDUE', total: usd[n], customer: customers[n], dueDate: at('2026-08-01T00:00:00Z') });
    }
    await addInvoice(s, { currency: 'USD', status: 'PENDING', total: 5, customer: customers[0], dueDate: at('2026-08-05T00:00:00Z') }); // past due, never marked
    await addInvoice(s, { currency: 'EUR', status: 'OVERDUE', total: 7, customer: customers[0], dueDate: at('2026-08-01T00:00:00Z') });
    await addInvoice(s, { currency: 'EUR', status: 'OVERDUE', total: 9, customer: customers[1], dueDate: at('2026-08-01T00:00:00Z') });
    await addInvoice(s, { currency: 'USD', status: 'PENDING', total: 999, customer: customers[8], dueDate: at('2026-08-30T00:00:00Z') }); // not overdue
    const actor = await actingFreelancerForTest(s.userId, KYIV);

    const collected = [];
    for (let page = 1; page <= 3; page += 1) {
      const res = data(await reads.listDebtorsPage(actor, { page, pageSize: 4 }));
      expect(res.totals).toEqual([
        { currency: 'EUR', debtorCount: 2, overdueTotal: '16.00', overdueCount: 2 },
        { currency: 'USD', debtorCount: 9, overdueTotal: '465.00', overdueCount: 10 },
      ]);
      expect(res.pageInfo).toMatchObject({ total: 11, totalPages: 3 });
      collected.push(...res.rows);
    }
    expect(collected).toHaveLength(11);
    const usdRows = collected.filter((r) => r.currency === 'USD');
    expect(usdRows.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(usdRows[0]).toMatchObject({ overdueTotal: '95.00', overdueCount: 2, customer: { customerId: s.customer.id } });
    // equal totals (30, 30): the lower-ordered name first, then id
    const tied = usdRows.filter((r) => r.overdueTotal === '30.00').map((r) => r.customer.name);
    expect(tied).toEqual([...tied].sort());
    expect(collected.map((r) => r.currency)).toEqual([...collected.map((r) => r.currency)].sort());

    const dashboard = data(await dash.getDebtors(actor, 'USD'));
    expect(usdRows.slice(0, dashboard.length).map((r) => r.customer.customerId)).toEqual(dashboard.map((d) => d.customerId));
    expect(usdRows.slice(0, dashboard.length).map((r) => Number(r.overdueTotal))).toEqual(dashboard.map((d) => d.total));
  });
});
