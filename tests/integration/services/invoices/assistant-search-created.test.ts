// ai-chat-v2 T64 (AC-48, AC-49; spec §1 F12; openapi SearchInvoicesInputDelta / SearchInvoicesRowDelta; ADR-0012):
// search_invoices filters by created day, sorts by it, and every row carries the day created and its in-app path.
// Exercised through the service and through both channels (chat tool and MCP) of the shared registry.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { isContainerRuntimeAvailable } from '../../../support/db/docker-availability';
import { truncateAllTables } from '../../../support/db/truncate';
import { createPersonalKey } from '../../../support/factories/personal-key';
import { startMcpHarness, type McpHarness } from '../../../support/mcp-e2e';
import { KYIV, addInvoice, seedFreelancer, type Seed } from '../dashboard/harness';
import { isInAppPath } from '@/lib/ai/in-app-links';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();
const at = (iso: string) => new Date(iso);

describe.runIf(containerRuntimeAvailable)('search_invoices created-date filters, sort and paths (T64)', () => {
  let h: McpHarness;
  let s: Seed;
  let fullKey: string;
  let tools: Record<string, { execute?: (input: any, ctx: any) => Promise<any> }>;
  let actor: any;
  const ids: Record<string, string> = {};

  async function draft(label: string, createdAt: string, issueDate: string) {
    const inv = await addInvoice(s, { currency: 'USD', status: 'DRAFT', total: 10, issueDate: at(issueDate) });
    await h.factoryPrisma.invoice.update({ where: { id: inv.id }, data: { createdAt: at(createdAt) } });
    ids[label] = inv.id;
  }

  beforeAll(async () => {
    h = await startMcpHarness();
  }, 60_000);
  afterAll(async () => {
    await h?.stop();
  });

  beforeEach(async () => {
    await truncateAllTables(h.factoryPrisma);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-13T09:00:00Z'));
    s = await seedFreelancer(h.factoryPrisma, ['USD']);
    await h.factoryPrisma.user.update({ where: { id: s.userId }, data: { timeZone: KYIV } });
    await draft('jan5', '2026-01-05T10:00:00Z', '2026-03-01T00:00:00Z');
    await draft('jan20', '2026-01-20T10:00:00Z', '2026-01-20T00:00:00Z');
    await draft('jan28', '2026-01-28T10:00:00Z', '2026-02-10T00:00:00Z');
    await draft('feb3', '2026-02-03T10:00:00Z', '2026-02-03T00:00:00Z');
    ({ fullKey } = await createPersonalKey(h.factoryPrisma, s.userId));
    const { createTurnContext } = await import('@/lib/ai/turn-context');
    const { createReadTools } = await import('@/lib/ai/tools/read-tools');
    actor = await h.actor(s.userId, KYIV);
    tools = createReadTools(createTurnContext({ actor, today: '2026-10-13' })) as typeof tools;
  });
  afterEach(() => vi.useRealTimers());

  const chat = (args: Record<string, unknown>) => tools.search_invoices.execute!(args, {});
  const mcp = async (args: Record<string, unknown>) => {
    const r = await h.call(fullKey, 'search_invoices', args);
    return r.isError ? r : r.structuredContent;
  };
  const JANUARY = { status: ['draft'], createdFrom: '2026-01-01', createdTo: '2026-01-31' };

  for (const [channel, run] of [
    ['chat', (a: Record<string, unknown>) => chat(a)],
    ['MCP', (a: Record<string, unknown>) => mcp(a)],
  ] as const) {
    describe(channel, () => {
      it('AC-49: the January drafts sorted by created day put the 28 January draft first', async () => {
        const out: any = await run({ ...JANUARY, sort: 'createdAt' });
        expect(out.rows.map((r: any) => r.invoiceId)).toEqual([ids.jan28, ids.jan20, ids.jan5]);
        expect(out.rows[0]).toMatchObject({ createdAt: '2026-01-28', status: 'draft' });
        expect(out.pageInfo.total).toBe(3);
      });

      it('AC-49: without sort the order stays by issue date, newest first (unchanged behaviour)', async () => {
        const out: any = await run({ ...JANUARY });
        expect(out.rows.map((r: any) => r.invoiceId)).toEqual([ids.jan5, ids.jan28, ids.jan20]);
      });

      it('created filters are inclusive calendar days: one bound alone, and a single-day range', async () => {
        const from: any = await run({ status: ['draft'], createdFrom: '2026-01-28', sort: 'createdAt' });
        expect(from.rows.map((r: any) => r.invoiceId)).toEqual([ids.feb3, ids.jan28]);
        const to: any = await run({ status: ['draft'], createdTo: '2026-01-20', sort: 'createdAt' });
        expect(to.rows.map((r: any) => r.invoiceId)).toEqual([ids.jan20, ids.jan5]);
        const one: any = await run({ status: ['draft'], createdFrom: '2026-01-28', createdTo: '2026-01-28' });
        expect(one.rows.map((r: any) => r.invoiceId)).toEqual([ids.jan28]);
      });

      it('AC-48: every row carries the in-app path of its editor and the local day created', async () => {
        const out: any = await run({ status: ['draft'], sort: 'createdAt' });
        expect(out.rows).toHaveLength(4);
        for (const r of out.rows) {
          expect(r.path).toBe(`/invoices/${r.invoiceId}/edit`);
          expect(isInAppPath(r.path)).toBe(true);
          expect(r.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        }
      });

      it('a created range after its start is a validation failure', async () => {
        const out: any = await run({ createdFrom: '2026-02-01', createdTo: '2026-01-01' });
        // Chat tools return the failure as { code, message, fieldErrors }; MCP wraps it as { isError: true }.
        expect(out).toMatchObject(channel === 'chat' ? { code: 'VALIDATION' } : { isError: true });
      });

      it('another Freelancer\'s drafts are never found by created day', async () => {
        const other = await seedFreelancer(h.factoryPrisma, ['USD']);
        const inv = await addInvoice(other, { currency: 'USD', status: 'DRAFT', total: 5 });
        await h.factoryPrisma.invoice.update({ where: { id: inv.id }, data: { createdAt: at('2026-01-30T10:00:00Z') } });
        const out: any = await run({ ...JANUARY, sort: 'createdAt' });
        expect(JSON.stringify(out)).not.toContain(inv.id);
      });
    });
  }

  it('the created day is cut in the Freelancer time zone (Kyiv), not UTC', async () => {
    // 22:30Z on 31 Jan is 00:30 on 1 Feb in Kyiv.
    await draft('edge', '2026-01-31T22:30:00Z', '2026-01-31T00:00:00Z');
    const jan: any = await chat({ ...JANUARY, sort: 'createdAt' });
    expect(jan.rows.map((r: any) => r.invoiceId)).not.toContain(ids.edge);
    const feb: any = await chat({ status: ['draft'], createdFrom: '2026-02-01', createdTo: '2026-02-01' });
    expect(feb.rows).toHaveLength(1);
    expect(feb.rows[0]).toMatchObject({ invoiceId: ids.edge, createdAt: '2026-02-01' });
  });

  it('both channels answer the same, apart from links', async () => {
    const strip = (v: any): any =>
      Array.isArray(v)
        ? v.map(strip)
        : v && typeof v === 'object'
          ? Object.fromEntries(Object.entries(v).filter(([k]) => k !== 'link' && k !== 'links').map(([k, x]) => [k, strip(x)]))
          : v;
    const args = { ...JANUARY, sort: 'createdAt' };
    expect(strip(await chat(args))).toEqual(strip(await mcp(args)));
  });

  it('service: a bad day or an inverted range is VALIDATION; the actor-scoped answer has createdAt and path', async () => {
    const search = await import('@/lib/services/invoices/assistant-search');
    expect(await search.searchInvoicesForAssistant(actor, { createdFrom: '2026-13-40' } as any)).toMatchObject({
      success: false,
      code: 'VALIDATION',
    });
    expect(await search.searchInvoicesForAssistant(actor, { createdFrom: '2026-02-01', createdTo: '2026-01-01' })).toMatchObject({
      success: false,
      code: 'VALIDATION',
    });
    expect(await search.searchInvoicesForAssistant(actor, { sort: 'bogus' } as any)).toMatchObject({ success: false, code: 'VALIDATION' });
    const ok: any = await search.searchInvoicesForAssistant(actor, { ...JANUARY, sort: 'createdAt' } as any);
    expect(ok.success).toBe(true);
    expect(ok.data.rows[0]).toMatchObject({ invoiceId: ids.jan28, createdAt: '2026-01-28', path: `/invoices/${ids.jan28}/edit` });
  });
});
