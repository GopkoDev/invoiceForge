// T24 (AC-23, AC-23b): the dashboard functions and the Assistant tools agree on "today", the period
// bounds, overdue membership and days overdue at the time-zone day boundaries, under a fake clock.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { isContainerRuntimeAvailable } from '../../support/db/docker-availability';
import { truncateAllTables } from '../../support/db/truncate';
import { createPersonalKey } from '../../support/factories/personal-key';
import { startMcpHarness, unwrap, money, type McpHarness } from '../../support/mcp-e2e';
import { addInvoice, seedFreelancer, type Seed } from '../services/dashboard/harness';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();
const NEW_YORK = 'America/New_York';
const KYIV = 'Europe/Kyiv';

describe.runIf(containerRuntimeAvailable)('Day boundaries: dashboard and Assistant agree (T24, AC-23, AC-23b)', () => {
  let h: McpHarness;

  beforeAll(async () => {
    h = await startMcpHarness();
  }, 60_000);
  afterAll(async () => {
    await h?.stop();
  });
  beforeEach(() => truncateAllTables(h.factoryPrisma));
  afterEach(() => vi.useRealTimers());

  const clock = (iso: string) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(iso));
  };

  async function setup(timeZone: string | null, due: string): Promise<{ s: Seed; fullKey: string }> {
    const s = await seedFreelancer(h.factoryPrisma, ['USD']);
    if (timeZone) await h.factoryPrisma.user.update({ where: { id: s.userId }, data: { timeZone } });
    // Stored as PENDING: "overdue" is derived from the due day and today, never from the stored status.
    await addInvoice(s, { currency: 'USD', status: 'PENDING', total: 120.5, dueDate: new Date(`${due}T00:00:00Z`) });
    const { fullKey } = await createPersonalKey(h.factoryPrisma, s.userId);
    return { s, fullKey };
  }

  /** The dashboard's view of the one invoice: overdue figure, Debtors, the recent list status. */
  async function dashboardView(s: Seed, timeZone: string, period?: { from: string; to: string }) {
    const actor = await h.actor(s.userId, timeZone);
    const stats = unwrap(await h.dashboard.getSummaryStats(actor, 'USD', period));
    const debtors = unwrap(await h.dashboard.getDebtors(actor, 'USD'));
    const recent = unwrap(await h.dashboard.getRecentInvoices(actor, 'USD'));
    return { stats, debtors, recent };
  }

  it('AC-23: at 00:30 on 1 September in Kyiv (still 31 August in UTC) both use the new month and both count the invoice overdue', async () => {
    clock('2026-08-31T21:30:00Z');
    const { s, fullKey } = await setup(KYIV, '2026-08-31');
    const month = { from: '2026-09-01', to: '2026-09-30' };

    const summary = (await h.call(fullKey, 'get_summary_figures', { period: { preset: 'this-month' } })).structuredContent;
    expect(summary.today).toBe('2026-09-01');
    expect(summary.timeZone).toBe(KYIV);
    expect(summary.period).toEqual({ preset: 'this-month', ...month });

    const dash = await dashboardView(s, KYIV, month);
    const usd = summary.currencies.find((c: any) => c.currency === 'USD');
    // The invoice is due on 31 August, outside the new month: neither surface counts it in the period...
    expect(usd.overdue).toMatchObject({ total: money(dash.stats.totalOverdue), count: dash.stats.overdueCount });
    expect(usd.overdue.count).toBe(0);
    // ...but both count it overdue, with 1 day overdue.
    const overdue = (await h.call(fullKey, 'list_overdue_invoices')).structuredContent;
    expect(overdue.today).toBe('2026-09-01');
    expect(overdue.rows).toHaveLength(1);
    expect(overdue.rows[0]).toMatchObject({ amount: '120.50', dueDate: '2026-08-31', daysOverdue: 1 });
    expect(unwrap(await h.dashboard.getSummaryStats(await h.actor(s.userId, KYIV), 'USD')).overdueCount).toBe(1);
    expect(dash.recent[0].status).toBe('OVERDUE');
    expect(dash.debtors).toHaveLength(1);
    const debtors = (await h.call(fullKey, 'list_debtors')).structuredContent.rows;
    expect(debtors[0]).toMatchObject({
      rank: 1,
      customer: { customerId: dash.debtors[0].customerId },
      overdueTotal: money(dash.debtors[0].total),
      overdueCount: dash.debtors[0].count,
    });
    // The old month ("last month") is where the invoice's due date sits, on both surfaces.
    const last = (await h.call(fullKey, 'get_summary_figures', { period: { preset: 'last-month' } })).structuredContent;
    const lastDash = await dashboardView(s, KYIV, { from: '2026-08-01', to: '2026-08-31' });
    expect(last.currencies[0].overdue).toMatchObject({
      total: money(lastDash.stats.totalOverdue),
      count: lastDash.stats.overdueCount,
    });
    expect(last.currencies[0].overdue.count).toBe(1);
  });

  it('AC-23: one hour earlier (23:30 on 31 August in Kyiv) the invoice due that day is not overdue yet', async () => {
    clock('2026-08-31T20:30:00Z');
    const { s, fullKey } = await setup(KYIV, '2026-08-31');
    const overdue = (await h.call(fullKey, 'list_overdue_invoices')).structuredContent;
    expect(overdue.today).toBe('2026-08-31');
    expect(overdue.rows).toEqual([]);
    const dash = await dashboardView(s, KYIV);
    expect(dash.stats.overdueCount).toBe(0);
    expect(dash.debtors).toEqual([]);
    expect(dash.recent[0].status).toBe('PENDING');
    expect((await h.call(fullKey, 'list_debtors')).structuredContent.rows).toEqual([]);
  });

  it('AC-23b: at 21:00 on 14 March in New York (already 15 March in UTC) neither surface counts the invoice due 14 March', async () => {
    clock('2026-03-15T01:00:00Z');
    const { s, fullKey } = await setup(NEW_YORK, '2026-03-14');
    const overdue = (await h.call(fullKey, 'list_overdue_invoices')).structuredContent;
    expect(overdue.today).toBe('2026-03-14');
    expect(overdue.timeZone).toBe(NEW_YORK);
    expect(overdue.rows).toEqual([]);
    expect(overdue.totals).toEqual([]);
    const dash = await dashboardView(s, NEW_YORK);
    expect(dash.stats.overdueCount).toBe(0);
    expect(dash.debtors).toEqual([]);
    expect(dash.recent[0].status).toBe('PENDING');
    expect((await h.call(fullKey, 'list_debtors')).structuredContent.rows).toEqual([]);
    // Still expected, not overdue, on both.
    const expected = (await h.call(fullKey, 'list_expected_payments')).structuredContent;
    expect(expected.totals).toEqual([{ currency: 'USD', total: '120.50', count: 1 }]);
    expect(dash.stats.allFuturePayments).toBe(120.5);
  });

  it('AC-23b: from 00:00 on 15 March in New York both count it overdue, with 1 day overdue', async () => {
    clock('2026-03-15T04:00:00Z');
    const { s, fullKey } = await setup(NEW_YORK, '2026-03-14');
    const overdue = (await h.call(fullKey, 'list_overdue_invoices')).structuredContent;
    expect(overdue.today).toBe('2026-03-15');
    expect(overdue.rows).toHaveLength(1);
    expect(overdue.rows[0]).toMatchObject({ dueDate: '2026-03-14', daysOverdue: 1, amount: '120.50' });
    const dash = await dashboardView(s, NEW_YORK);
    expect(dash.stats.overdueCount).toBe(1);
    expect(money(dash.stats.totalOverdue)).toBe(overdue.totals[0].total);
    expect(dash.recent[0].status).toBe('OVERDUE');
    const debtors = (await h.call(fullKey, 'list_debtors')).structuredContent.rows;
    expect(debtors).toHaveLength(1);
    expect(dash.debtors).toHaveLength(1);
    expect(money(dash.debtors[0].total)).toBe(debtors[0].overdueTotal);
  });

  it('with no time zone saved both surfaces use UTC', async () => {
    clock('2026-03-15T00:30:00Z');
    const { s, fullKey } = await setup(null, '2026-03-14');
    const overdue = (await h.call(fullKey, 'list_overdue_invoices')).structuredContent;
    expect(overdue.timeZone).toBe('UTC');
    expect(overdue.today).toBe('2026-03-15');
    expect(overdue.rows[0].daysOverdue).toBe(1);
    expect((await dashboardView(s, 'UTC')).stats.overdueCount).toBe(1);
  });
});
