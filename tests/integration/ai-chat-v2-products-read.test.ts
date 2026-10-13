// ai-chat-v2 T06 (AC-02, AC-05, AC-06, AC-07; openapi x-mcp-tools list_products + ProductsAnswer): the product read
// question, registered once and answered the same through a Personal key without Draft permission and through the
// chat. One row per product and currency, prices exactly as stored, Custom prices only for an owned Customer.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { isContainerRuntimeAvailable } from './../support/db/docker-availability';
import { truncateAllTables } from './../support/db/truncate';
import { createFreelancer } from './../support/factories/user';
import { createCustomer } from './../support/factories/customer';
import { createProduct } from './../support/factories/product';
import { createCustomPrice } from './../support/factories/custom-price';
import { createPersonalKey } from './../support/factories/personal-key';
import { startMcpHarness, type McpHarness } from './../support/mcp-e2e';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();
const TZ = 'Europe/Kyiv';

describe.runIf(containerRuntimeAvailable)('list_products (ai-chat-v2 T06)', () => {
  let h: McpHarness;
  let userId: string;
  let otherUserId: string;
  let fullKey: string;
  let ids: { usd: string; eur: string; acme: string; globex: string; theirAudit: string };

  beforeAll(async () => {
    h = await startMcpHarness();
  }, 60_000);
  afterAll(async () => {
    await h?.stop();
  });

  beforeEach(async () => {
    const prisma = h.factoryPrisma;
    await truncateAllTables(prisma);
    const user = await createFreelancer(prisma, { timeZone: TZ });
    userId = user.id;
    // AC-02: "Consulting" 50 USD and 45 EUR (two rows), a 40 USD custom price agreed with Acme Corp.
    const usd = await createProduct(prisma, userId, { name: 'Consulting', unit: 'hours', price: 50, currency: 'USD' });
    const eur = await createProduct(prisma, userId, { name: 'Consulting', unit: 'hours', price: 45, currency: 'EUR' });
    const acme = await createCustomer(prisma, userId, { name: 'Acme Corp' });
    await createCustomPrice(prisma, usd.id, acme.id, { price: 40 });
    // An archived product is never listed.
    await createProduct(prisma, userId, { name: 'Consulting Legacy', price: 10, currency: 'USD', isActive: false });

    // AC-07: only the second Freelancer has the product "Audit" and a Customer.
    const other = await createFreelancer(prisma, { timeZone: TZ });
    otherUserId = other.id;
    const theirAudit = await createProduct(prisma, otherUserId, { name: 'Audit', price: 99, currency: 'USD' });
    const globex = await createCustomer(prisma, otherUserId, { name: 'Globex Ltd' });
    await createCustomPrice(prisma, theirAudit.id, globex.id, { price: 77 });
    ids = { usd: usd.id, eur: eur.id, acme: acme.id, globex: globex.id, theirAudit: theirAudit.id };

    // AC-06: a key without Draft permission.
    ({ fullKey } = await createPersonalKey(prisma, userId));
  });

  async function chatTools() {
    const { createTurnContext } = await import('@/lib/ai/turn-context');
    const { createReadTools } = await import('@/lib/ai/tools/read-tools');
    const actor = await h.actor(userId, TZ);
    return createReadTools(createTurnContext({ actor, today: '2026-10-13' })) as Record<string, { execute?: (i: any, c: any) => Promise<any> }>;
  }

  const expectedRows = () => [
    { productId: ids.eur, name: { freelancerText: 'Consulting' }, unit: { freelancerText: 'hours' }, price: '45.00', currency: 'EUR', customPrice: null },
    { productId: ids.usd, name: { freelancerText: 'Consulting' }, unit: { freelancerText: 'hours' }, price: '50.00', currency: 'USD', customPrice: '40.00' },
  ];

  it('AC-02: through MCP, "Consulting" for Acme Corp answers 45.00 EUR, 50.00 USD and the 40.00 USD custom price', async () => {
    const viaMcp = await h.call(fullKey, 'list_products', { name: 'Consulting', customerId: ids.acme });
    expect(viaMcp.isError).toBe(false);
    const sc = viaMcp.structuredContent as any;
    expect(sc.rows).toEqual(expectedRows());
    expect(sc.customer).toEqual({ customerId: ids.acme, name: { freelancerText: 'Acme Corp' } });
    expect(sc.pageInfo).toMatchObject({ page: 1, pageSize: 20, pageSizeCapped: false, total: 2, hasMore: false });
  });

  it('AC-02: the service returns plain strings for name and unit and decimal strings for the prices', async () => {
    const { listProductsForAssistant } = await import('@/lib/services/products/products');
    const res = await listProductsForAssistant(await h.actor(userId, TZ), { name: 'Consulting', customerId: ids.acme });
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.rows).toEqual([
      { productId: ids.eur, name: 'Consulting', unit: 'hours', price: '45.00', currency: 'EUR', customPrice: null },
      { productId: ids.usd, name: 'Consulting', unit: 'hours', price: '50.00', currency: 'USD', customPrice: '40.00' },
    ]);
    expect(res.data.customer).toMatchObject({ customerId: ids.acme });
    expect(res.data.pageInfo).toMatchObject({ page: 1, pageSize: 20, total: 2, hasMore: false });
  });

  it('without a customerId the custom price is null and customer is null', async () => {
    const viaMcp = await h.call(fullKey, 'list_products', { name: 'Consulting' });
    const sc = viaMcp.structuredContent as any;
    expect(sc.customer).toBeNull();
    expect(sc.rows.map((r: any) => [r.currency, r.price, r.customPrice])).toEqual([
      ['EUR', '45.00', null],
      ['USD', '50.00', null],
    ]);
  });

  it('the name filter folds case, spaces and look-alike letters; an archived product is not listed', async () => {
    const viaMcp = await h.call(fullKey, 'list_products', { name: '  CОNSULTING ' }); // Cyrillic О
    const sc = viaMcp.structuredContent as any;
    expect(sc.rows.map((r: any) => r.productId)).toEqual([ids.eur, ids.usd]);
    expect(sc.pageInfo.total).toBe(2);
    const all = await h.call(fullKey, 'list_products', {});
    expect((all.structuredContent as any).rows.map((r: any) => r.name.freelancerText)).toEqual(['Consulting', 'Consulting']);
    expect(JSON.stringify(all)).not.toContain('Legacy');
  });

  it('AC-05: "audit" matches nothing for this Freelancer: no rows, total 0', async () => {
    const viaMcp = await h.call(fullKey, 'list_products', { name: 'audit' });
    expect(viaMcp.isError).toBe(false);
    expect((viaMcp.structuredContent as any).rows).toEqual([]);
    expect((viaMcp.structuredContent as any).pageInfo.total).toBe(0);
  });

  it('more than 20 matches: 20 rows and a total of all of them', async () => {
    for (let i = 0; i < 22; i++) await createProduct(h.factoryPrisma, userId, { name: `Widget ${String(i).padStart(2, '0')}`, price: 5 });
    const viaMcp = await h.call(fullKey, 'list_products', { name: 'widget' });
    const sc = viaMcp.structuredContent as any;
    expect(sc.rows).toHaveLength(20);
    expect(sc.pageInfo).toMatchObject({ total: 22, hasMore: true });
  });

  it('pageSize above 20 is capped at 20 and reported', async () => {
    const viaMcp = await h.call(fullKey, 'list_products', { pageSize: 50 });
    expect((viaMcp.structuredContent as any).pageInfo).toMatchObject({ pageSize: 20, pageSizeCapped: true });
  });

  it('AC-06: the chat adapter answers exactly what MCP answers (one registry)', async () => {
    const tools = await chatTools();
    expect(Object.keys(tools)).toContain('list_products');
    const args = { name: 'Consulting', customerId: ids.acme };
    const viaChat = await tools.list_products.execute!(args, {});
    const viaMcp = await h.call(fullKey, 'list_products', args);
    const { links, ...answer } = viaChat;
    expect(links).toBeDefined();
    expect(answer).toEqual(viaMcp.structuredContent);
  });

  it('AC-07: another Freelancer\'s product "Audit" never appears', async () => {
    const tools = await chatTools();
    const viaChat = await tools.list_products.execute!({ name: 'Audit' }, {});
    expect(viaChat.rows).toEqual([]);
    expect(viaChat.pageInfo.total).toBe(0);
    expect(JSON.stringify(await tools.list_products.execute!({}, {}))).not.toContain('Audit');
  });

  it('AC-07: another Freelancer\'s customerId is answered exactly as an unknown id, on MCP and in the service', async () => {
    const theirs = await h.call(fullKey, 'list_products', { customerId: ids.globex });
    const unknown = await h.call(fullKey, 'list_products', { customerId: 'does-not-exist' });
    expect(theirs.isError).toBe(true);
    expect((theirs.structuredContent as any).code).toBe('NOT_FOUND');
    expect((theirs.structuredContent as any).message).toBe('Customer not found.');
    expect(theirs.structuredContent).toEqual(unknown.structuredContent);
    // The harness's own timing field (`ms`) is not part of the answer; a duration like 11.877 must not read as a leak.
    const answer = { ...(theirs as Record<string, unknown>) };
    delete answer.ms;
    expect(JSON.stringify(answer)).not.toContain('Globex');
    expect(JSON.stringify(answer)).not.toContain('77');

    const { listProductsForAssistant } = await import('@/lib/services/products/products');
    const actor = await h.actor(userId, TZ);
    const svcTheirs = await listProductsForAssistant(actor, { customerId: ids.globex });
    const svcUnknown = await listProductsForAssistant(actor, { customerId: 'does-not-exist' });
    expect(svcTheirs).toMatchObject({ success: false, code: 'NOT_FOUND', error: 'Customer not found.' });
    expect(svcTheirs).toEqual(svcUnknown);
  });

  it('is listed by tools/list as read-only', async () => {
    await h.factoryPrisma.limitEvent.deleteMany();
    const res = await h.route.POST(
      new Request('http://localhost/api/mcp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          'x-real-ip': '203.0.113.9',
          authorization: `Bearer ${fullKey}`,
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      })
    );
    const { tools } = (await res.json()).result;
    const tool = tools.find((t: any) => t.name === 'list_products');
    expect(tool).toBeDefined();
    expect(tool.annotations).toMatchObject({ readOnlyHint: true });
  });
});

describe.runIf(!containerRuntimeAvailable)('list_products (ai-chat-v2 T06)', () => {
  it.skip('skipped: no container runtime', () => {});
});
