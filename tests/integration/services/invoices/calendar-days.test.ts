// T25 (spec.md §1 "a due date is a calendar day … without any shift", §5 AC-12, AC-14, AC-15, AC-23,
// AC-23b, AC-24; review-2026-10-05 F-02, F-03) — an issue or due date is stored as the picked day at
// T00:00:00Z, and the overdue rule and every period compare by calendar day. Through the real
// business layer on a throwaway database.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../../support/db/container';
import { createTestPrismaClient } from '../../../support/db/client';
import { truncateAllTables } from '../../../support/db/truncate';
import { actingFreelancerForTest } from '../../../support/acting-freelancer';
import { addInvoice, seedFreelancer } from '../dashboard/harness';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

let testClient: PrismaClient;
vi.mock('@/prisma', () => ({ prisma: new Proxy({}, { get: (_t, k) => (testClient as never)[k] }) }));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, unstable_cache: (fn: () => unknown) => fn }));

type Svc = typeof import('@/lib/services/invoices/invoices');
type Find = typeof import('@/lib/services/invoices/find-by-reference');
type Search = typeof import('@/lib/services/invoices/assistant-search');
type Reads = typeof import('@/lib/services/dashboard/assistant-reads');
type Dash = typeof import('@/lib/services/dashboard/dashboard');
type Helpers = typeof import('@/store/invoice-editor-store/helpers');

function data<T>(r: { success: true; data: T } | { success: false; code: string; error: string }): T {
  if (!r.success) throw new Error(`expected success, got ${r.code}: ${r.error}`);
  return r.data;
}

const KYIV = 'Europe/Kyiv';
const NEW_YORK = 'America/New_York';
const ORIGINAL_TZ = process.env.TZ;
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe.runIf(containerRuntimeAvailable)('calendar-day storage and comparison (T25)', () => {
  let db: TestDatabase;
  let svc: Svc;
  let find: Find;
  let search: Search;
  let reads: Reads;
  let dash: Dash;
  let helpers: Helpers;

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    testClient = createTestPrismaClient(db.connectionString);
    svc = await import('@/lib/services/invoices/invoices');
    find = await import('@/lib/services/invoices/find-by-reference');
    search = await import('@/lib/services/invoices/assistant-search');
    reads = await import('@/lib/services/dashboard/assistant-reads');
    dash = await import('@/lib/services/dashboard/dashboard');
    helpers = await import('@/store/invoice-editor-store/helpers');
  }, 60_000);

  afterAll(async () => {
    await testClient?.$disconnect();
    await db?.stop();
  });

  afterEach(async () => {
    vi.useRealTimers();
    if (ORIGINAL_TZ === undefined) delete process.env.TZ;
    else process.env.TZ = ORIGINAL_TZ;
    await truncateAllTables(testClient);
  });

  function clock(iso: string) {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(iso));
  }

  /** What the editor sends: its form holds local Dates, which it turns into days on save. */
  function editorForm(s: Awaited<ReturnType<typeof seedFreelancer>>, issueDate: Date, dueDate: Date) {
    return helpers.toSavePayload({
      invoiceNumber: '',
      status: 'PENDING',
      senderProfileId: s.profileId,
      bankAccountId: s.bank.USD.id,
      customerId: s.customer.id,
      issueDate,
      dueDate,
      currency: 'USD',
      poNumber: '',
      paymentTerms: '',
      items: [{ id: 'item-0', productId: '', productName: 'Widget', description: '', unit: 'pcs', quantity: 1, price: 100, total: 100 }],
      taxRate: 0,
      discount: 0,
      shipping: 0,
      notes: '',
      terms: '',
    });
  }

  it('AC-12/AC-23b/AC-24: a due date picked as local midnight in Europe/Kyiv is stored as that day, is not overdue on it and reports it', async () => {
    process.env.TZ = KYIV;
    clock('2026-10-15T09:00:00Z'); // 12:00 on 15 Oct in Kyiv
    const s = await seedFreelancer(testClient, ['USD']);
    const actor = await actingFreelancerForTest(s.userId, KYIV);
    const picked = new Date(2026, 9, 15); // the Calendar's value: Kyiv local midnight = 2026-10-14T21:00Z
    expect(picked.toISOString()).toBe('2026-10-14T21:00:00.000Z');

    const created = data(await svc.createInvoice(actor, editorForm(s, new Date(2026, 9, 1), picked)));
    const stored = await testClient.invoice.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored.issueDate.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(stored.dueDate.toISOString()).toBe('2026-10-15T00:00:00.000Z');

    const onDueDay = data(await find.findInvoiceByReference(actor, { invoiceId: created.id }));
    expect(onDueDay).toMatchObject({ status: 'pending', daysOverdue: null, dueDate: '2026-10-15', issueDate: '2026-10-01' });
    const rows = data(await search.searchInvoicesForAssistant(actor, {})).rows;
    expect(rows[0]).toMatchObject({ dueDate: '2026-10-15', status: 'pending', daysOverdue: null });

    clock('2026-10-16T09:00:00Z');
    const nextDay = data(await find.findInvoiceByReference(actor, { invoiceId: created.id }));
    expect(nextDay).toMatchObject({ status: 'overdue', daysOverdue: 1, dueDate: '2026-10-15' });
  });

  it('AC-12/AC-23b: updateInvoice stores the picked day the same way', async () => {
    process.env.TZ = KYIV;
    clock('2026-10-15T09:00:00Z');
    const s = await seedFreelancer(testClient, ['USD']);
    const actor = await actingFreelancerForTest(s.userId, KYIV);
    const created = data(await svc.createInvoice(actor, editorForm(s, new Date(2026, 9, 1), new Date(2026, 9, 20))));

    data(await svc.updateInvoice(actor, created.id, { ...editorForm(s, new Date(2026, 9, 2), new Date(2026, 9, 15)), invoiceNumber: (await testClient.invoice.findUniqueOrThrow({ where: { id: created.id } })).invoiceNumber }));
    const stored = await testClient.invoice.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored.issueDate.toISOString()).toBe('2026-10-02T00:00:00.000Z');
    expect(stored.dueDate.toISOString()).toBe('2026-10-15T00:00:00.000Z');
  });

  it('a duplicated invoice gets today and today + 30 days as calendar days in the owner zone', async () => {
    clock('2026-10-15T22:30:00Z'); // 01:30 on 16 Oct in Kyiv, 18:30 on 15 Oct in New York
    const s = await seedFreelancer(testClient, ['USD']);
    const original = await addInvoice(s, { currency: 'USD', status: 'PENDING', total: 10, issueDate: day('2026-09-01'), dueDate: day('2026-09-10') });
    const kyiv = await actingFreelancerForTest(s.userId, KYIV);
    const copy = data(await svc.duplicateInvoice(kyiv, original.id));
    const stored = await testClient.invoice.findUniqueOrThrow({ where: { id: copy.id } });
    expect(stored.issueDate.toISOString()).toBe('2026-10-16T00:00:00.000Z');
    expect(stored.dueDate.toISOString()).toBe('2026-11-15T00:00:00.000Z');
  });

  it('AC-14/AC-15: an America/New_York this-month includes the invoice due on the 1st and excludes the 1st of next month; dashboard and Assistant agree', async () => {
    clock('2026-10-15T16:00:00Z');
    const s = await seedFreelancer(testClient, ['USD']);
    const dueOn = (iso: string, total: number) =>
      addInvoice(s, { currency: 'USD', status: 'PENDING', total, issueDate: day('2026-09-20'), dueDate: day(iso) });
    await dueOn('2026-10-01', 100); // today is 15 Oct: the 1st is overdue, and counts in October
    const nov1 = await dueOn('2026-11-01', 200);
    const last = await dueOn('2026-10-31', 400);
    await dueOn('2026-09-30', 800); // overdue, due before the month
    const actor = await actingFreelancerForTest(s.userId, NEW_YORK);

    // The month, as the dashboard and the Assistant both read it.
    const period = { from: '2026-10-01', to: '2026-10-31' };
    const stats = data(await dash.getSummaryStats(actor, 'USD', period));
    // Planned (pending, not overdue) due in October: only the 31st. Overdue due in October: the 1st.
    expect(stats.plannedCount).toBe(1);
    expect(stats.totalPlanned).toBe(400);
    expect(stats.overdueCount).toBe(1);
    expect(stats.totalOverdue).toBe(100);

    const summary = data(await reads.getSummaryFiguresAllCurrencies(actor, { preset: 'this-month' }));
    expect(summary.period).toMatchObject({ from: '2026-10-01', to: '2026-10-31' });
    expect(summary.currencies[0].planned).toMatchObject({ total: '400.00', count: 1 });
    expect(summary.currencies[0].overdue).toMatchObject({ total: '100.00', count: 1 });

    const expected = data(await reads.listExpectedPaymentsPage(actor, { period: { preset: 'this-month' } }));
    expect(expected.rows.map((r) => r.invoiceId)).toEqual([last.id]);
    expect(expected.rows[0].dueDate).toBe('2026-10-31');

    // The 1st of November is in November (its UTC instant is 20:00 on 31 Oct in New York) and not in October.
    const nov = data(await reads.listExpectedPaymentsPage(actor, { period: { from: '2026-11-01', to: '2026-11-01' } }));
    expect(nov.rows.map((r) => r.invoiceId)).toEqual([nov1.id]);
  });

  it('AC-14: the Assistant due-date filters and the dashboard agree on the first and last day of a month for a New York owner', async () => {
    clock('2026-09-15T16:00:00Z');
    const s = await seedFreelancer(testClient, ['USD']);
    const dueOn = (iso: string, total: number) =>
      addInvoice(s, { currency: 'USD', status: 'PENDING', total, issueDate: day('2026-09-01'), dueDate: day(iso) });
    const oct1 = await dueOn('2026-10-01', 100);
    const oct31 = await dueOn('2026-10-31', 200);
    const nov1 = await dueOn('2026-11-01', 400);
    const sep30 = await dueOn('2026-09-30', 800);
    const actor = await actingFreelancerForTest(s.userId, NEW_YORK);

    const found = data(await search.searchInvoicesForAssistant(actor, { dueDateFrom: '2026-10-01', dueDateTo: '2026-10-31' }));
    expect(found.rows.map((r) => r.invoiceId).sort()).toEqual([oct1.id, oct31.id].sort());
    expect(found.rows.map((r) => r.dueDate).sort()).toEqual(['2026-10-01', '2026-10-31']);
    expect(found.rows.some((r) => r.invoiceId === nov1.id || r.invoiceId === sep30.id)).toBe(false);

    const stats = data(await dash.getSummaryStats(actor, 'USD', { from: '2026-10-01', to: '2026-10-31' }));
    expect(stats.plannedCount).toBe(2);
    expect(stats.totalPlanned).toBe(300);
  });

  it('AC-14: paid invoices count by their issue day, not by a zone-local instant', async () => {
    clock('2026-10-15T16:00:00Z');
    const s = await seedFreelancer(testClient, ['USD']);
    await addInvoice(s, { currency: 'USD', status: 'PAID', total: 10, issueDate: day('2026-10-01'), dueDate: day('2026-10-10') });
    await addInvoice(s, { currency: 'USD', status: 'PAID', total: 20, issueDate: day('2026-11-01'), dueDate: day('2026-11-10') });
    const actor = await actingFreelancerForTest(s.userId, NEW_YORK);
    const stats = data(await dash.getSummaryStats(actor, 'USD', { from: '2026-10-01', to: '2026-10-31' }));
    expect(stats.receivedCount).toBe(1);
    expect(stats.totalReceived).toBe(10);

    // The chart puts each paid invoice on its own issue day, in every zone.
    const chart = data(await dash.getChartData(actor, 'USD', { from: '2026-10-01', to: '2026-10-03' }));
    expect(chart.map((p) => [p.date, p.paid])).toEqual([
      ['2026-10-01', 10],
      ['2026-10-02', 10],
      ['2026-10-03', 10],
    ]);
  });

  it('AC-14: the invoice list issue-date filter compares calendar days', async () => {
    clock('2026-10-15T16:00:00Z');
    const s = await seedFreelancer(testClient, ['USD']);
    const a = await addInvoice(s, { currency: 'USD', status: 'PENDING', total: 1, issueDate: day('2026-10-01'), dueDate: day('2026-10-20') });
    await addInvoice(s, { currency: 'USD', status: 'PENDING', total: 2, issueDate: day('2026-11-01'), dueDate: day('2026-11-20') });
    const actor = await actingFreelancerForTest(s.userId, NEW_YORK);
    const list = data(await svc.listInvoices(actor, { dateFrom: '2026-10-01', dateTo: '2026-10-31' }));
    expect(list.items.map((i) => i.id)).toEqual([a.id]);
  });
});
