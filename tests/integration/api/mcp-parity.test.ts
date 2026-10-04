// T24 (AC-15, QG-1): every figure an Assistant is given equals the dashboard's, to the cent, over a
// seeded multi-currency fixture, through the real POST /api/mcp endpoint.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { isContainerRuntimeAvailable } from '../../support/db/docker-availability';
import { truncateAllTables } from '../../support/db/truncate';
import { createPersonalKey } from '../../support/factories/personal-key';
import { startMcpHarness, unwrap, money, type McpHarness } from '../../support/mcp-e2e';
import { KYIV, addInvoice, seedParityFixture, type Seed } from '../services/dashboard/harness';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();
const at = (iso: string) => new Date(iso);

const PRESETS = ['this-month', 'last-month', 'this-year', 'last-year', 'all-time'] as const;
type Period = { from: string; to: string };

describe.runIf(containerRuntimeAvailable)('MCP / dashboard parity (T24, AC-15)', () => {
  let h: McpHarness;
  let s: Seed;
  let fullKey: string;

  beforeAll(async () => {
    h = await startMcpHarness();
  }, 60_000);
  afterAll(async () => {
    await h?.stop();
  });

  beforeEach(async () => {
    await truncateAllTables(h.factoryPrisma);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-03-28T12:00:00Z'));
    s = await seedParityFixture(h.factoryPrisma);
    await h.factoryPrisma.user.update({ where: { id: s.userId }, data: { timeZone: KYIV } });
    // GBP: a currency issued on invoices that no bank account carries; more past and 2025 invoices.
    await addInvoice(s, { currency: 'USD', status: 'PAID', total: 70.07, issueDate: at('2025-07-01T09:00:00Z') });
    await addInvoice(s, { currency: 'USD', status: 'PAID', total: 12.12, issueDate: at('2026-02-14T09:00:00Z') });
    await addInvoice(s, { currency: 'EUR', status: 'PENDING', total: 19.99, issueDate: at('2026-02-01T09:00:00Z'), dueDate: at('2026-04-15T00:00:00Z') });
    await addInvoice(s, { currency: 'GBP', status: 'PAID', total: 310.1, issueDate: at('2026-03-05T09:00:00Z') });
    await addInvoice(s, { currency: 'GBP', status: 'PENDING', total: 0.1, issueDate: at('2026-03-06T09:00:00Z'), dueDate: at('2026-03-30T00:00:00Z') });
    await addInvoice(s, { currency: 'GBP', status: 'PENDING', total: 0.2, issueDate: at('2026-03-06T09:00:00Z'), dueDate: at('2026-03-31T00:00:00Z') });
    await addInvoice(s, { currency: 'GBP', status: 'OVERDUE', total: 55.55, issueDate: at('2026-02-06T09:00:00Z'), dueDate: at('2026-03-01T00:00:00Z') });
    ({ fullKey } = await createPersonalKey(h.factoryPrisma, s.userId));
  });
  afterEach(() => vi.useRealTimers());

  const dashboardRange = async (name: (typeof PRESETS)[number] | Period): Promise<Period | undefined> => {
    if (typeof name !== 'string') return name;
    // The dashboard's own presets, spelled out for 2026-03-28 in Europe/Kyiv.
    return {
      'this-month': { from: '2026-03-01', to: '2026-03-31' },
      'last-month': { from: '2026-02-01', to: '2026-02-28' },
      'this-year': { from: '2026-01-01', to: '2026-12-31' },
      'last-year': { from: '2025-01-01', to: '2025-12-31' },
      'all-time': undefined,
    }[name];
  };

  const periods: Array<[string, any, (typeof PRESETS)[number] | Period]> = [
    ...PRESETS.map((p): [string, any, (typeof PRESETS)[number]] => [p, { preset: p }, p]),
    ['custom range', { from: '2026-03-25', to: '2026-04-02' }, { from: '2026-03-25', to: '2026-04-02' }],
  ];

  it.each(periods)('get_summary_figures equals getSummaryStats for every currency: %s', async (_n, toolPeriod, spec) => {
    const actor = await h.actor(s.userId, KYIV);
    const range = await dashboardRange(spec);
    const r = await h.call(fullKey, 'get_summary_figures', { period: toolPeriod });
    expect(r.isError).toBe(false);
    const answer = r.structuredContent;
    expect(answer.timeZone).toBe(KYIV);
    expect(answer.today).toBe('2026-03-28');
    if (range) expect(answer.period).toMatchObject(range);

    const tabs = unwrap(await h.dashboard.getCurrencyTabs(actor)).map((t) => t.currency);
    const tooled = answer.currencies.map((c: any) => c.currency);
    expect([...tooled].sort()).toEqual(['EUR', 'GBP', 'USD']);
    // Every currency of the answer is a dashboard tab, the no-bank-account GBP included (ADR-0008).
    for (const c of tooled) expect(tabs).toContain(c);

    for (const c of answer.currencies) {
      const d = unwrap(await h.dashboard.getSummaryStats(actor, c.currency, range));
      expect(c.received).toMatchObject({ total: money(d.totalReceived), count: d.receivedCount });
      expect(c.planned).toMatchObject({ total: money(d.totalPlanned), count: d.plannedCount });
      expect(c.overdue).toMatchObject({ total: money(d.totalOverdue), count: d.overdueCount });
      expect(c.allFuturePayments).toMatchObject({ total: money(d.allFuturePayments), count: d.allFuturePaymentsCount });
      for (const f of [c.received, c.planned, c.overdue, c.allFuturePayments]) expect(f.total).toMatch(/^-?\d+\.\d{2}$/);
    }
  });

  it.each(periods)('list_expected_payments totals equal the planned figure for the period: %s', async (_n, toolPeriod, spec) => {
    const actor = await h.actor(s.userId, KYIV);
    const range = await dashboardRange(spec);
    const r = await h.call(fullKey, 'list_expected_payments', { period: toolPeriod, pageSize: 50 });
    expect(r.isError).toBe(false);
    for (const currency of ['USD', 'EUR', 'GBP'] as const) {
      const d = unwrap(await h.dashboard.getSummaryStats(actor, currency, range));
      const t = r.structuredContent.totals.find((x: any) => x.currency === currency);
      expect(t ? { total: t.total, count: t.count } : { total: '0.00', count: 0 }).toEqual({
        total: money(d.totalPlanned),
        count: d.plannedCount,
      });
    }
  });

  it('list_expected_payments without a period equals the dashboard Expected payments group', async () => {
    const actor = await h.actor(s.userId, KYIV);
    const r = await h.call(fullKey, 'list_expected_payments');
    for (const currency of ['USD', 'EUR', 'GBP'] as const) {
      const groups = unwrap(await h.dashboard.getExpectedPayments(actor, currency));
      const t = r.structuredContent.totals.find((x: any) => x.currency === currency);
      expect(t ? { total: t.total, count: t.count } : { total: '0.00', count: 0 }).toEqual(
        groups.length ? { total: money(groups[0].total), count: groups[0].count } : { total: '0.00', count: 0 }
      );
      // The dashboard shows the earliest-due invoices first: the tool lists the same ones first.
      const shown = groups.flatMap((g) => g.invoices.map((i) => i.id));
      const rows = r.structuredContent.rows.filter((x: any) => x.currency === currency).map((x: any) => x.invoiceId);
      expect(rows.slice(0, shown.length)).toEqual(shown);
    }
  });

  it('list_overdue_invoices totals equal the dashboard overdue figure for every currency', async () => {
    const actor = await h.actor(s.userId, KYIV);
    const r = await h.call(fullKey, 'list_overdue_invoices', { pageSize: 50 });
    expect(r.isError).toBe(false);
    for (const currency of ['USD', 'EUR', 'GBP'] as const) {
      const d = unwrap(await h.dashboard.getSummaryStats(actor, currency));
      const t = r.structuredContent.totals.find((x: any) => x.currency === currency);
      expect(t ? { total: t.total, count: t.count } : { total: '0.00', count: 0 }).toEqual({
        total: money(d.totalOverdue),
        count: d.overdueCount,
      });
    }
  });

  it('list_debtors agrees with the dashboard Debtors on rank, total and count for the entries it shows', async () => {
    const actor = await h.actor(s.userId, KYIV);
    const r = await h.call(fullKey, 'list_debtors', { pageSize: 50 });
    expect(r.isError).toBe(false);
    let compared = 0;
    for (const currency of ['USD', 'EUR', 'GBP'] as const) {
      const shown = unwrap(await h.dashboard.getDebtors(actor, currency));
      const rows = r.structuredContent.rows.filter((x: any) => x.currency === currency);
      expect(rows.length).toBeGreaterThanOrEqual(shown.length);
      shown.forEach((d, i) => {
        compared += 1;
        expect(rows[i]).toMatchObject({
          rank: i + 1,
          customer: { customerId: d.customerId },
          overdueTotal: money(d.total),
          overdueCount: d.count,
        });
      });
    }
    expect(compared).toBeGreaterThanOrEqual(5);
    // The tool lists every Debtor, the dashboard only its top entries (USD has four).
    expect(r.structuredContent.rows.filter((x: any) => x.currency === 'USD')).toHaveLength(4);
  });
});
