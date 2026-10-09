// invoice-integrity T21 (spec.md §5 AC-24, AC-26; sad.md §6 flow 8) — an Assistant with a Personal key
// is offered read-only tools only (nothing that changes an invoice or its status), and get_invoice
// answers from the invoice's issued details: after a Customer rename it shows the issued name, the same
// name the PDF prints (T14's block builder).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../support/db/container';
import { createTestPrismaClient } from '../../support/db/client';
import { truncateAllTables } from '../../support/db/truncate';
import { createPersonalKey } from '../../support/factories/personal-key';
import { addInvoice, seedFreelancer } from '../services/dashboard/harness';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

vi.mock('sonner', () => ({ toast: { error: vi.fn(), warning: vi.fn(), success: vi.fn() } }));

let rpcId = 0;
function post(body: unknown, key: string): Request {
  return new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'x-real-ip': '203.0.113.10',
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });
}

// The read-only tool set this release ships with (sad.md §6 flow 8).
const READ_ONLY_TOOLS = [
  'get_invoice',
  'get_summary_figures',
  'list_customers',
  'list_debtors',
  'list_expected_payments',
  'list_overdue_invoices',
  'search_invoices',
];

describe.runIf(containerRuntimeAvailable)('Assistant: read-only and issued details (T21, AC-24, AC-26)', () => {
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

  beforeEach(() => truncateAllTables(factoryPrisma));

  async function setup() {
    const s = await seedFreelancer(factoryPrisma, ['USD']);
    const { fullKey } = await createPersonalKey(factoryPrisma, s.userId);
    return { s, fullKey };
  }

  it('AC-24: every offered tool is read-only and none changes an invoice or its status', async () => {
    const { fullKey } = await setup();
    const res = await route.POST(post({ jsonrpc: '2.0', id: ++rpcId, method: 'tools/list' }, fullKey));
    const tools = (await res.json()).result.tools as { name: string; annotations: { readOnlyHint: boolean } }[];
    expect(tools.map((t) => t.name).sort()).toEqual(READ_ONLY_TOOLS);
    for (const t of tools) expect(t.annotations.readOnlyHint, t.name).toBe(true);
  });

  it('AC-24: calling a write tool by name is refused and the invoice is unchanged', async () => {
    const { s, fullKey } = await setup();
    const inv = await addInvoice(s, { currency: 'USD', status: 'PENDING', total: 10 });
    const before = await factoryPrisma.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    const res = await route.POST(
      post(
        { jsonrpc: '2.0', id: ++rpcId, method: 'tools/call', params: { name: 'update_invoice_status', arguments: { invoiceId: inv.id, status: 'PAID' } } },
        fullKey
      )
    );
    const body = await res.json();
    expect(body.error ?? body.result?.isError).toBeTruthy();
    expect(await factoryPrisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).toEqual(before);
  });

  it('AC-26: after a Customer rename, get_invoice shows the issued Customer name, the one the PDF prints', async () => {
    const { s, fullKey } = await setup();
    const inv = await addInvoice(s, { currency: 'USD', status: 'PAID', total: 10, customerName: 'Acme Ltd' });
    await factoryPrisma.customer.update({ where: { id: s.customer.id }, data: { name: 'Acme Renamed GmbH' } });

    const res = await route.POST(
      post({ jsonrpc: '2.0', id: ++rpcId, method: 'tools/call', params: { name: 'get_invoice', arguments: { invoiceId: inv.id } } }, fullKey)
    );
    const result = (await res.json()).result as { isError: boolean; structuredContent: any };
    expect(result.isError).toBe(false);
    expect(result.structuredContent.customer.name).toEqual({ freelancerText: 'Acme Ltd' });

    const { getInvoice } = await import('@/lib/services/invoices/invoices');
    const { prepareInvoiceDataForPdf } = await import('@/lib/helpers/invoice-pdf-helpers');
    const { actingFreelancerForTest } = await import('../../support/acting-freelancer');
    const serialized = await getInvoice(await actingFreelancerForTest(s.userId, 'UTC'), inv.id);
    if (!serialized.success) throw new Error(serialized.error);
    expect(prepareInvoiceDataForPdf(serialized.data).customer?.name).toBe('Acme Ltd');
  });
});

describe.runIf(!containerRuntimeAvailable)('Assistant: read-only and issued details (T21)', () => {
  it.skip('skipped: no container runtime', () => {});
});
