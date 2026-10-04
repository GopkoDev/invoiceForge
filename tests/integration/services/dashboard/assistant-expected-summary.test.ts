// T15 (spec.md §5 AC-14, AC-15, AC-16): Expected payments by period and per-currency summary figures,
// equal to the dashboard's own getExpectedPayments / getSummaryStats to the cent.
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

type Reads = typeof import('@/lib/services/dashboard/assistant-reads');
type Dash = typeof import('@/lib/services/dashboard/dashboard');

function data<T>(r: { success: true; data: T } | { success: false; code: string; error: string }): T {
  if (!r.success) throw new Error(`expected success, got ${r.code}: ${r.error}`);
  return r.data;
}

const at = (iso: string) => new Date(iso);
const AC16 =
  'The period must be a named preset (this-month, last-month, this-year, last-year, all-time) or a from–to range of at most 5 years whose start is not after its end.';

describe.runIf(containerRuntimeAvailable)('Assistant Expected payments and summary figures (T15)', () => {
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

  async function seed() {
    clock('2026-08-10T10:00:00Z');
    const s = await seedFreelancer(testClient, ['USD', 'EUR']);
    const due = (currency: 'USD' | 'EUR', total: number, iso: string, status: 'PENDING' | 'OVERDUE' | 'PAID' | 'DRAFT' = 'PENDING') =>
      addInvoice(s, { currency, status, total, issueDate: at('2026-08-02T09:00:00Z'), dueDate: at(iso) });
    const usdLate = await due('USD', 100.1, '2026-08-25T00:00:00Z');
    const usdSoon = await due('USD', 200.2, '2026-08-12T00:00:00Z');
    await due('USD', 50, '2026-09-05T00:00:00Z');
    await due('USD', 33, '2026-08-05T00:00:00Z'); // past due: overdue by the shared rule
    await due('USD', 7, '2026-08-20T00:00:00Z', 'PAID');
    await due('USD', 9999, '2026-08-20T00:00:00Z', 'DRAFT');
    const eurA = await due('EUR', 10.1, '2026-08-31T00:00:00Z');
    await due('EUR', 20.2, '2026-10-01T00:00:00Z');
    return { s, usdLate, usdSoon, eurA };
  }

  it('AC-14: this-month lists only not-overdue invoices due in the period, grouped by currency, with totals over all matches and the bounds and zone', async () => {
    const { s, usdSoon, usdLate, eurA } = await seed();
    const actor = await actingFreelancerForTest(s.userId, KYIV);

    const res = data(await reads.listExpectedPaymentsPage(actor, { period: { preset: 'this-month' }, pageSize: 2 }));

    expect(res.today).toBe('2026-08-10');
    expect(res.timeZone).toBe(KYIV);
    expect(res.period).toEqual({ preset: 'this-month', from: '2026-08-01', to: '2026-08-31' });
    // EUR sorts before USD; a page of 2 holds EUR then the earliest USD
    expect(res.rows.map((r) => r.invoiceId)).toEqual([eurA.id, usdSoon.id]);
    expect(res.rows[1]).toMatchObject({
      invoiceNumber: usdSoon.invoiceNumber,
      senderProfile: { senderProfileId: s.profileId, name: s.profile.name },
      customer: { customerId: s.customer.id },
      status: 'pending',
      amount: '200.20',
      currency: 'USD',
      dueDate: '2026-08-12',
      daysOverdue: null,
    });
    expect(res.totals).toEqual([
      { currency: 'EUR', total: '10.10', count: 1 },
      { currency: 'USD', total: '300.30', count: 2 },
    ]);
    expect(res.pageInfo).toMatchObject({ page: 1, pageSize: 2, total: 3, totalPages: 2, hasMore: true });
    const p2 = data(await reads.listExpectedPaymentsPage(actor, { period: { preset: 'this-month' }, pageSize: 2, page: 2 }));
    expect(p2.rows.map((r) => r.invoiceId)).toEqual([usdLate.id]);
  });

  it('AC-14: totals equal the dashboard planned figure with a period and Expected payments without one', async () => {
    const { s } = await seed();
    const actor = await actingFreelancerForTest(s.userId, KYIV);
    const period = { from: '2026-08-01', to: '2026-08-31' };

    const withPeriod = data(await reads.listExpectedPaymentsPage(actor, { period }));
    for (const t of withPeriod.totals) {
      const stats = data(await dash.getSummaryStats(actor, t.currency, period));
      expect(Number(t.total)).toBe(stats.totalPlanned);
      expect(t.count).toBe(stats.plannedCount);
    }

    const without = data(await reads.listExpectedPaymentsPage(actor, {}));
    expect(without.period).toEqual({ preset: null, from: null, to: null });
    expect(without.totals.map((t) => t.currency)).toEqual(['EUR', 'USD']);
    for (const t of without.totals) {
      const groups = data(await dash.getExpectedPayments(actor, t.currency));
      expect(Number(t.total)).toBe(groups[0].total);
      expect(t.count).toBe(groups[0].count);
    }
    expect(without.pageInfo.total).toBe(5);
  });

  it('AC-14: currency filter, all-time bounds null, page past the last is PAGE_OUT_OF_RANGE', async () => {
    const { s } = await seed();
    const actor = await actingFreelancerForTest(s.userId, KYIV);
    const usd = data(await reads.listExpectedPaymentsPage(actor, { currency: 'USD', period: { preset: 'all-time' } }));
    expect(usd.period).toEqual({ preset: 'all-time', from: null, to: null });
    expect(usd.totals).toEqual([{ currency: 'USD', total: '350.30', count: 3 }]);
    const out = await reads.listExpectedPaymentsPage(actor, { page: 9 });
    expect(out).toMatchObject({ success: false, code: 'NOT_FOUND', details: { kind: 'PAGE_OUT_OF_RANGE' } });
  });

  it('AC-15: summary figures equal getSummaryStats to the cent for every issued-invoice currency, with countedBy', async () => {
    const { s } = await seed();
    // a currency only on an issued invoice (no bank account) is still reported (ADR-0008)
    await addInvoice(s, { currency: 'GBP', status: 'PENDING', total: 12.34, dueDate: at('2026-08-15T00:00:00Z') });
    const actor = await actingFreelancerForTest(s.userId, KYIV);

    const res = data(await reads.getSummaryFiguresAllCurrencies(actor, { preset: 'this-month' }));

    expect(res.today).toBe('2026-08-10');
    expect(res.timeZone).toBe(KYIV);
    expect(res.period).toEqual({ preset: 'this-month', from: '2026-08-01', to: '2026-08-31' });
    expect(res.currencies.map((c) => c.currency)).toEqual(['EUR', 'GBP', 'USD']);
    for (const c of res.currencies) {
      const st = data(await dash.getSummaryStats(actor, c.currency, { from: '2026-08-01', to: '2026-08-31' }));
      expect(c.received).toEqual({ total: st.totalReceived.toFixed(2), count: st.receivedCount, countedBy: 'issue_date' });
      expect(c.planned).toEqual({ total: st.totalPlanned.toFixed(2), count: st.plannedCount, countedBy: 'due_date' });
      expect(c.overdue).toEqual({ total: st.totalOverdue.toFixed(2), count: st.overdueCount, countedBy: 'due_date' });
      expect(c.allFuturePayments).toEqual({
        total: st.allFuturePayments.toFixed(2),
        count: st.allFuturePaymentsCount,
        countedBy: 'none',
      });
    }
    const usd = res.currencies.find((c) => c.currency === 'USD')!;
    expect(usd.received.total).toBe('7.00');
    expect(usd.planned.total).toBe('300.30');
    expect(usd.overdue.total).toBe('33.00');
    expect(usd.allFuturePayments.total).toBe('383.30');
    expect(Object.keys(usd).sort()).toEqual(['allFuturePayments', 'currency', 'overdue', 'planned', 'received']);
  });

  it('AC-15: no period means this-month; all-time covers everything', async () => {
    const { s } = await seed();
    const actor = await actingFreelancerForTest(s.userId, KYIV);
    const def = data(await reads.getSummaryFiguresAllCurrencies(actor));
    expect(def.period).toEqual({ preset: 'this-month', from: '2026-08-01', to: '2026-08-31' });
    const all = data(await reads.getSummaryFiguresAllCurrencies(actor, { preset: 'all-time' }));
    expect(all.period).toEqual({ preset: 'all-time', from: null, to: null });
    const st = data(await dash.getSummaryStats(actor, 'USD'));
    expect(all.currencies.find((c) => c.currency === 'USD')!.planned.total).toBe(st.totalPlanned.toFixed(2));
  });

  it('AC-15: a currency present only on a cancelled invoice has no summary entry', async () => {
    const s = await seedFreelancer(testClient, ['USD']);
    await addInvoice(s, { currency: 'USD', status: 'PAID', total: 10, issueDate: new Date('2026-08-10T09:00:00Z') });
    await addInvoice(s, { currency: 'EUR', status: 'CANCELLED', total: 50, issueDate: new Date('2026-08-10T09:00:00Z'), dueDate: new Date('2026-08-20T09:00:00Z') });
    const actor = await actingFreelancerForTest(s.userId, KYIV);
    const res = data(await reads.getSummaryFiguresAllCurrencies(actor, { preset: 'all-time' }));
    expect(res.currencies.map((c) => c.currency)).toEqual(['USD']);
  });

  it('AC-16: unknown preset, over 5 years and start after end are refused with the period message; exactly 5 years is accepted', async () => {
    const { s } = await seed();
    const actor = await actingFreelancerForTest(s.userId, KYIV);
    const bad = [
      { preset: 'next-month' },
      { from: '2020-01-01', to: '2025-01-02' },
      { from: '2026-08-10', to: '2026-08-09' },
      { from: '2026-02-30', to: '2026-03-01' },
    ];
    for (const period of bad) {
      for (const res of [
        await reads.getSummaryFiguresAllCurrencies(actor, period as never),
        await reads.listExpectedPaymentsPage(actor, { period: period as never }),
      ]) {
        expect(res).toMatchObject({ success: false, code: 'VALIDATION', error: AC16, fieldErrors: { period: [AC16] } });
      }
    }
    expect(data(await reads.getSummaryFiguresAllCurrencies(actor, { from: '2020-01-01', to: '2025-01-01' })).period).toEqual({
      preset: null,
      from: '2020-01-01',
      to: '2025-01-01',
    });
  });

  it('presets resolve in the account time zone', async () => {
    clock('2026-12-31T23:30:00Z'); // already 1 Jan 2027 in Kyiv
    const s = await seedFreelancer(testClient, ['USD']);
    const actor = await actingFreelancerForTest(s.userId, KYIV);
    const res = data(await reads.getSummaryFiguresAllCurrencies(actor, { preset: 'last-year' }));
    expect(res.today).toBe('2027-01-01');
    expect(res.period).toEqual({ preset: 'last-year', from: '2026-01-01', to: '2026-12-31' });
    const lm = data(await reads.getSummaryFiguresAllCurrencies(actor, { preset: 'last-month' }));
    expect(lm.period).toEqual({ preset: 'last-month', from: '2026-12-01', to: '2026-12-31' });
  });
});
