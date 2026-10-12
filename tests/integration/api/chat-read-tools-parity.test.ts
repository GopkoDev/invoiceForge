// T13 (ai-assistant, AC-02..AC-05, AC-08, AC-40, QG-1): the chat's read tools answer from the same
// registry as MCP, bound to the acting Freelancer, so every figure equals the dashboard to the cent.
// The model is never involved: tools are called directly, as the agent's tool loop would.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { isContainerRuntimeAvailable } from '../../support/db/docker-availability';
import { truncateAllTables } from '../../support/db/truncate';
import { createPersonalKey } from '../../support/factories/personal-key';
import { createCustomer } from '../../support/factories/customer';
import { startMcpHarness, unwrap, money, type McpHarness } from '../../support/mcp-e2e';
import { KYIV, addInvoice, seedFreelancer, seedParityFixture, type Seed } from '../services/dashboard/harness';
import { appLinkSchema } from '@/lib/validations/assistant-chat';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();
const at = (iso: string) => new Date(iso);

const READ_TOOL_NAMES = [
  'list_overdue_invoices',
  'list_debtors',
  'list_expected_payments',
  'get_summary_figures',
  'list_customers',
  'search_invoices',
  'get_invoice',
];

/** Links are the chat's own concern (AppLink ids, absolute URLs are MCP's): compare the rest. */
function withoutLinks(value: any): any {
  if (Array.isArray(value)) return value.map(withoutLinks);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([k]) => k !== 'link' && k !== 'links')
        .map(([k, v]) => [k, withoutLinks(v)])
    );
  }
  return value;
}

describe.runIf(containerRuntimeAvailable)('chat read tools / dashboard parity (T13)', () => {
  let h: McpHarness;
  let s: Seed;
  let other: Seed;
  let fullKey: string;
  let tools: Record<string, { inputSchema: any; execute?: (input: any, ctx: any) => Promise<any> }>;
  let globex: { id: string; name: string };
  let kyivDueYesterday: { id: string };
  let otherInvoiceId: string;

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
    // AC-05: issued, unpaid, due yesterday in Kyiv, never marked overdue.
    kyivDueYesterday = await addInvoice(s, {
      currency: 'USD',
      status: 'PENDING',
      total: 123.45,
      issueDate: at('2026-03-10T09:00:00Z'),
      dueDate: at('2026-03-27T00:00:00Z'),
    });
    // AC-40: only the other Freelancer has a Customer named Globex.
    other = await seedFreelancer(h.factoryPrisma, ['USD']);
    const g = await createCustomer(h.factoryPrisma, other.userId, { name: 'Globex' });
    globex = { id: g.id, name: g.name };
    otherInvoiceId = (await addInvoice(other, { currency: 'USD', status: 'OVERDUE', total: 4242.42, customer: g, dueDate: at('2020-01-01T00:00:00Z') })).id;
    ({ fullKey } = await createPersonalKey(h.factoryPrisma, s.userId));

    const { createTurnContext } = await import('@/lib/ai/turn-context');
    const { createReadTools } = await import('@/lib/ai/tools/read-tools');
    const actor = await h.actor(s.userId, KYIV);
    tools = createReadTools(createTurnContext({ actor, today: '2026-03-28' })) as typeof tools;
  });
  afterEach(() => vi.useRealTimers());

  const chat = (name: string, args: Record<string, unknown> = {}) => tools[name].execute!(args, {});

  it('offers exactly the seven MCP read questions, none taking an actor from the model', () => {
    expect(Object.keys(tools).sort()).toEqual([...READ_TOOL_NAMES].sort());
    for (const t of Object.values(tools)) {
      const keys = Object.keys(t.inputSchema.shape ?? {});
      for (const forbidden of ['actorId', 'userId', 'freelancerId', 'ownerId']) expect(keys).not.toContain(forbidden);
    }
  });

  it('a user id passed by the model is ignored: the answer is the acting Freelancer\'s own', async () => {
    const own = await chat('list_overdue_invoices', { pageSize: 50 });
    const forged = await chat('list_overdue_invoices', { pageSize: 50, userId: other.userId, actorId: other.userId });
    expect(withoutLinks(forged)).toEqual(withoutLinks(own));
    expect(JSON.stringify(forged)).not.toContain('4242.42');
  });

  it('every read tool answers the same as MCP, apart from links (parity by construction)', async () => {
    const calls: Array<[string, Record<string, unknown>]> = [
      ['list_overdue_invoices', { pageSize: 50 }],
      ['list_debtors', { pageSize: 50 }],
      ['list_expected_payments', { pageSize: 50 }],
      ['get_summary_figures', { period: { preset: 'this-year' } }],
      ['list_customers', {}],
      ['search_invoices', { customer: 'Renamed Customer Ltd' }],
    ];
    for (const [name, args] of calls) {
      const viaMcp = await h.call(fullKey, name, args);
      expect(viaMcp.isError).toBe(false);
      expect(withoutLinks(await chat(name, args))).toEqual(withoutLinks(viaMcp.structuredContent));
    }
  });

  it('AC-02: overdue totals and Debtors equal the dashboard for every currency', async () => {
    const actor = await h.actor(s.userId, KYIV);
    const overdue = await chat('list_overdue_invoices', { pageSize: 50 });
    const debtors = await chat('list_debtors', { pageSize: 50 });
    for (const currency of ['USD', 'EUR'] as const) {
      const d = unwrap(await h.dashboard.getSummaryStats(actor, currency));
      const t = overdue.totals.find((x: any) => x.currency === currency);
      expect({ total: t.total, count: t.count }).toEqual({ total: money(d.totalOverdue), count: d.overdueCount });
      const shown = unwrap(await h.dashboard.getDebtors(actor, currency));
      const rows = debtors.rows.filter((x: any) => x.currency === currency);
      shown.forEach((x, i) =>
        expect(rows[i]).toMatchObject({ customer: { customerId: x.customerId }, overdueTotal: money(x.total), overdueCount: x.count })
      );
    }
  });

  it('AC-02/AC-03: invoices named in an answer come with AppLink ids that open them', async () => {
    const overdue = await chat('list_overdue_invoices', { pageSize: 50 });
    expect(overdue.rows.length).toBeGreaterThan(0);
    for (const l of overdue.links) expect(appLinkSchema.safeParse(l).success).toBe(true);
    const linked = overdue.links.filter((l: any) => l.kind === 'invoice').map((l: any) => l.invoiceId);
    for (const row of overdue.rows) expect(linked).toContain(row.invoiceId);

    const one = await chat('get_invoice', { invoiceId: kyivDueYesterday.id });
    expect(one).toMatchObject({ invoiceId: kyivDueYesterday.id, currency: 'USD', dueDate: '2026-03-27' });
    expect(one.customer).toBeDefined();
    expect(one.amounts).toBeDefined();
    expect(one.status).toBeDefined();
    expect(one.links).toContainEqual(expect.objectContaining({ kind: 'invoice', invoiceId: kyivDueYesterday.id }));
  });

  it('AC-03: an invoice is found by its number', async () => {
    const full = await h.factoryPrisma.invoice.findUniqueOrThrow({ where: { id: kyivDueYesterday.id } });
    const one = await chat('get_invoice', { invoiceNumber: full.invoiceNumber });
    expect(one.invoiceId).toBe(kyivDueYesterday.id);
    expect(one.links).toContainEqual(expect.objectContaining({ kind: 'invoice', invoiceId: kyivDueYesterday.id }));
  });

  it('AC-04: a partial list keeps the registry\'s total and hasMore, and no total is invented', async () => {
    const page = await chat('list_overdue_invoices', { pageSize: 2 });
    const viaMcp = await h.call(fullKey, 'list_overdue_invoices', { pageSize: 2 });
    expect(page.rows).toHaveLength(2);
    expect(page.pageInfo.hasMore).toBe(true);
    expect(page.pageInfo).toEqual(viaMcp.structuredContent.pageInfo);
    expect(page.totals).toEqual(viaMcp.structuredContent.totals);
    expect(withoutLinks(page)).toEqual(withoutLinks(viaMcp.structuredContent));
    // Links cover only the rows shown.
    expect(page.links.filter((l: any) => l.kind === 'invoice')).toHaveLength(2);
  });

  it('AC-05: an unpaid invoice due yesterday in Kyiv counts as overdue, like the dashboard', async () => {
    const overdue = await chat('list_overdue_invoices', { pageSize: 50 });
    expect(overdue.timeZone).toBe(KYIV);
    expect(overdue.today).toBe('2026-03-28');
    expect(overdue.rows.map((r: any) => r.invoiceId)).toContain(kyivDueYesterday.id);
  });

  it('AC-08: with no read question for a total, the answer holds no total the adapter computed', async () => {
    const viaMcp = await h.call(fullKey, 'search_invoices', { customer: 'Renamed Customer Ltd', status: ['paid'] });
    const answer = await chat('search_invoices', { customer: 'Renamed Customer Ltd', status: ['paid'] });
    expect(withoutLinks(answer)).toEqual(withoutLinks(viaMcp.structuredContent));
  });

  it('AC-40: Globex of another Freelancer answers exactly as a Customer that does not exist', async () => {
    const probes: Array<[string, Record<string, unknown>, Record<string, unknown>]> = [
      ['list_customers', { name: globex.name }, { name: 'Nonexistent Customer Ltd' }],
      ['search_invoices', { customer: globex.name }, { customer: 'Nonexistent Customer Ltd' }],
      ['search_invoices', { customerId: globex.id }, { customerId: 'cmunknown00000000000000000' }],
    ];
    for (const [name, real, unknown] of probes) {
      const a = JSON.stringify(withoutLinks(await chat(name, real)));
      const b = JSON.stringify(withoutLinks(await chat(name, unknown)));
      expect(a).toBe(b);
      expect(a).not.toContain('Globex');
      expect(a).not.toContain('4242.42');
    }
    const hit = await chat('get_invoice', { invoiceId: otherInvoiceId });
    const miss = await chat('get_invoice', { invoiceId: 'cmunknown00000000000000000' });
    expect(withoutLinks(hit)).toEqual(withoutLinks(miss));
    expect(JSON.stringify(hit)).not.toContain(otherInvoiceId);
  });
});
