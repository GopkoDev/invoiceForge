// T26 (ai-assistant; spec.md §5 AC-17, AC-29; ADR-0011): create_draft_invoice through POST /api/mcp.
// Listed to every key; a read-only key is refused; an external Assistant with no sender profile with a
// bank account gets the AC-17 issues; a Draft-permission key creates a Draft with origin PERSONAL_KEY.
// DATABASE_URL points at the throwaway container.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../support/db/container';
import { createTestPrismaClient } from '../../support/db/client';
import { truncateAllTables } from '../../support/db/truncate';
import { createFreelancer } from '../../support/factories/user';
import { createCustomer } from '../../support/factories/customer';
import { createSenderProfile } from '../../support/factories/sender-profile';
import { createBankAccount } from '../../support/factories/bank-account';
import { createPersonalKey } from '../../support/factories/personal-key';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

let rpcId = 0;

function post(body: unknown, key: string): Request {
  return new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'x-real-ip': '203.0.113.9',
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });
}

const ARGS = {
  customer: 'Acme',
  lines: [{ description: 'consulting', quantity: '20', unit: 'hours', price: '50' }],
};

describe.runIf(containerRuntimeAvailable)('MCP create_draft_invoice (T26)', () => {
  let db: TestDatabase;
  let factoryPrisma: PrismaClient;
  let appPrisma: PrismaClient;
  let route: typeof import('@/app/api/mcp/route');

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    factoryPrisma = createTestPrismaClient(db.connectionString);
    ({ prisma: appPrisma } = (await import('@/prisma')) as { prisma: PrismaClient });
    route = await import('@/app/api/mcp/route');
  }, 60_000);

  afterAll(async () => {
    await appPrisma?.$disconnect();
    await factoryPrisma?.$disconnect();
    await db?.stop();
  });

  beforeEach(async () => {
    await truncateAllTables(factoryPrisma);
  });

  async function setup(opts: { canCreateDrafts: boolean; withProfile?: boolean }) {
    const user = await createFreelancer(factoryPrisma, { email: 't26@example.com', timeZone: 'Europe/Kyiv' });
    if (opts.withProfile !== false) {
      const profile = await createSenderProfile(factoryPrisma, user.id, { name: 'Main' });
      await createBankAccount(factoryPrisma, profile.id, { currency: 'USD' });
    }
    const acme = await createCustomer(factoryPrisma, user.id, { name: 'Acme Corp' });
    const { row, fullKey } = await createPersonalKey(factoryPrisma, user.id, {
      name: 'Claude Desktop',
      canCreateDrafts: opts.canCreateDrafts,
    });
    return { user, acme, row, fullKey };
  }

  async function rpc(key: string, method: string, params?: Record<string, unknown>) {
    const res = await route.POST(post({ jsonrpc: '2.0', id: ++rpcId, method, params }, key));
    expect(res.status).toBe(200);
    return (await res.json()).result as any;
  }

  const callDraft = (key: string, args: Record<string, unknown> = ARGS) =>
    rpc(key, 'tools/call', { name: 'create_draft_invoice', arguments: args });

  it('lists create_draft_invoice to a read-only key with readOnlyHint false', async () => {
    const { fullKey } = await setup({ canCreateDrafts: false });
    const { tools } = await rpc(fullKey, 'tools/list');
    const tool = tools.find((t: any) => t.name === 'create_draft_invoice');
    expect(tool.annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    });
    expect(tools).toHaveLength(8);
  });

  it('AC-29: a read-only key is refused with FORBIDDEN and nothing is created', async () => {
    const { fullKey } = await setup({ canCreateDrafts: false });
    const result = await callDraft(fullKey);
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      code: 'FORBIDDEN',
      message:
        'This key can only read. To create drafts, the Freelancer can create a new key with Draft permission on the Connect your AI page.',
    });
    expect(await factoryPrisma.invoice.count()).toBe(0);
  });

  it('AC-17: a Draft key of a Freelancer without a sender profile with a bank account gets the issue, nothing is created', async () => {
    const { fullKey } = await setup({ canCreateDrafts: true, withProfile: false });
    const result = await callDraft(fullKey);
    expect(result.isError).toBe(true);
    expect(result.structuredContent.code).toBe('VALIDATION');
    expect(result.structuredContent.details.kind).toBe('DRAFT_ISSUES');
    expect(result.structuredContent.details.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'NO_SENDER_PROFILE_WITH_ACCOUNT' })])
    );
    expect(await factoryPrisma.invoice.count()).toBe(0);
  });

  it('a Draft key creates a Draft with origin PERSONAL_KEY and answers DraftCreatedAnswer with the editor link', async () => {
    const { fullKey, row, acme } = await setup({ canCreateDrafts: true });
    const result = await callDraft(fullKey);
    expect(result.isError).toBeFalsy();
    const invoices = await factoryPrisma.invoice.findMany();
    expect(invoices).toHaveLength(1);
    const inv = invoices[0];
    expect(inv.status).toBe('DRAFT');
    expect(inv.assistantOrigin).toBe('PERSONAL_KEY');
    expect(inv.assistantKeyId).toBe(row.id);
    expect(inv.assistantKeyName).toBe('Claude Desktop');
    expect(inv.customerId).toBe(acme.id);
    expect(result.structuredContent).toMatchObject({
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      status: 'DRAFT',
      repeated: false,
    });
    expect(result.structuredContent.link.endsWith(`/invoices/${inv.id}/edit`)).toBe(true);
    expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent);
  });

  it('a repeated call with the same repeatKey answers the same draft without creating another', async () => {
    const { fullKey } = await setup({ canCreateDrafts: true });
    const first = await callDraft(fullKey, { ...ARGS, repeatKey: 'r-1' });
    const second = await callDraft(fullKey, { ...ARGS, repeatKey: 'r-1' });
    expect(second.structuredContent.invoiceId).toBe(first.structuredContent.invoiceId);
    expect(second.structuredContent.repeated).toBe(true);
    expect(await factoryPrisma.invoice.count()).toBe(1);
  });
});
