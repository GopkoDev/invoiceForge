// T13 (spec.md §5 AC-12, AC-13, AC-14, AC-21, AC-22, AC-26; public-api.md §2.6) — request-free
// listInvoices against a real throwaway Postgres. No session, no next/*.
import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../../support/db/container';
import { createTestPrismaClient } from '../../../support/db/client';
import { truncateAllTables } from '../../../support/db/truncate';
import { createFreelancer } from '../../../support/factories/user';
import { createCustomer } from '../../../support/factories/customer';
import { createSenderProfile } from '../../../support/factories/sender-profile';
import { createBankAccount } from '../../../support/factories/bank-account';
import { createInvoice } from '../../../support/factories/invoice';
import { actingFreelancerForTest } from '../../../support/acting-freelancer';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

type Result = {
  success: boolean;
  code?: string;
  error?: string;
  fieldErrors?: Record<string, string[] | string>;
  data?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
};
type ListFn = (actor: unknown, query?: Record<string, unknown>) => Promise<Result>;
type Item = { id: string };

const DATE_MESSAGE = 'Give both dates as YYYY-MM-DD, with the start on or before the end.';
const ids = (res: Result) => (res.data.items as Item[]).map((i) => i.id);

describe.runIf(containerRuntimeAvailable)('listInvoices service (T13)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;
  let listInvoices: ListFn;

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    prisma = createTestPrismaClient(db.connectionString);
    const mod = (await import('@/lib/services/invoices/invoices')) as unknown as {
      listInvoices?: ListFn;
    };
    listInvoices = mod.listInvoices as ListFn;
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  afterEach(async () => {
    await truncateAllTables(prisma);
  });

  async function seed(email: string) {
    const user = await createFreelancer(prisma, { email });
    const senderProfile = await createSenderProfile(prisma, user.id, { invoiceCounter: 1 });
    const bankAccount = await createBankAccount(prisma, senderProfile.id);
    const customer = await createCustomer(prisma, user.id, { name: '1 cust' });
    const make = (
      n: number,
      overrides: Record<string, unknown> = {},
      who: { customer?: typeof customer } = {}
    ) =>
      createInvoice(prisma, {
        senderProfile,
        customer: who.customer ?? customer,
        bankAccount,
        overrides: {
          invoiceNumber: `${senderProfile.invoicePrefix}-${String(n).padStart(4, '0')}`,
          ...overrides,
        },
      });
    return { user, senderProfile, bankAccount, customer, make };
  }

  it('exposes listInvoices from the invoices service', () => {
    expect(typeof listInvoices).toBe('function');
  });

  it('AC-12: no query returns the whole list as page 1, one page, no more results', async () => {
    const a = await seed('t13-a@example.com');
    for (let i = 1; i <= 3; i++) await a.make(i);
    const actor = await actingFreelancerForTest(a.user.id);
    const res = await listInvoices(actor);
    expect(res.success).toBe(true);
    expect(res.data.items).toHaveLength(3);
    expect(res.data).toMatchObject({ total: 3, page: 1, totalPages: 1, hasMore: false, totalInvoices: 3 });
    expect(res.data.filterOptions).toBeDefined();
  });

  it('AC-12: a page without a page size uses 10', async () => {
    const a = await seed('t13-a@example.com');
    for (let i = 1; i <= 12; i++) await a.make(i);
    const actor = await actingFreelancerForTest(a.user.id);
    const res = await listInvoices(actor, { page: 1 });
    expect(res.data.items).toHaveLength(10);
    expect(res.data).toMatchObject({ total: 12, pageSize: 10, totalPages: 2, hasMore: true });
  });

  it('AC-14: page 99 returns page 1; an empty list answers page 1 and no pages', async () => {
    const a = await seed('t13-a@example.com');
    const actor = await actingFreelancerForTest(a.user.id);
    const empty = await listInvoices(actor, { page: 99 });
    expect(empty.data).toMatchObject({ items: [], total: 0, page: 1, totalPages: 0 });
    for (let i = 1; i <= 3; i++) await a.make(i);
    const res = await listInvoices(actor, { page: 99, pageSize: 1 });
    expect(res.data.page).toBe(1);
    expect(res.data.items).toHaveLength(1);
    expect(res.data.totalPages).toBe(3);
  });

  it.each([
    ['status', { status: 'BOGUS' }, 'status'],
    ['status constructor', { status: 'constructor' }, 'status'],
    ['status toString', { status: 'toString' }, 'status'],
    ['status __proto__', { status: '__proto__' }, 'status'],
    ['tab', { tab: 'weird' }, 'tab'],
    ['sortField', { sortField: 'customerName' }, 'sortField'],
    ['sortDirection', { sortDirection: 'up' }, 'sortDirection'],
    ['page', { page: 0 }, 'page'],
    ['pageSize', { pageSize: 2.5 }, 'pageSize'],
    ['huge page', { page: 1e20 }, 'page'],
    ['huge pageSize', { pageSize: 1e20 }, 'pageSize'],
    ['search', { search: 'x'.repeat(101) }, 'search'],
    ['dateFrom only', { dateFrom: '2026-09-01' }, 'dateFrom'],
    ['dateTo only', { dateTo: '2026-09-30' }, 'dateTo'],
    ['reversed range', { dateFrom: '2026-09-30', dateTo: '2026-09-01' }, 'dateFrom'],
    ['impossible date', { dateFrom: '2026-02-30', dateTo: '2026-03-01' }, 'dateFrom'],
  ])('AC-13/AC-26: refuses %s with VALIDATION and no items', async (_n, query, key) => {
    const a = await seed('t13-a@example.com');
    await a.make(1);
    const actor = await actingFreelancerForTest(a.user.id);
    const res = await listInvoices(actor, query);
    expect(res.success).toBe(false);
    expect(res.code).toBe('VALIDATION');
    expect(res.fieldErrors).toHaveProperty(key);
    expect(res.data).toBeUndefined();
  });

  it.each(['%', '_'])('AC-11: searching %s matches only literal text', async (term) => {
    const a = await seed('t13-a@example.com');
    await a.make(1);
    const lit = await a.make(2, {}, { customer: await createCustomer(prisma, a.user.id, { name: `50${term} off` }) });
    const actor = await actingFreelancerForTest(a.user.id);
    const res = await listInvoices(actor, { search: term });
    expect(ids(res)).toEqual([lit.id]);
  });

  it('refusal messages name the allowed values', async () => {
    const a = await seed('t13-a@example.com');
    const actor = await actingFreelancerForTest(a.user.id);
    const sort = await listInvoices(actor, { sortField: 'customerName' });
    expect(JSON.stringify(sort.fieldErrors)).toContain(
      'Unknown sort option. Allowed: createdAt, issueDate, dueDate, total, invoiceNumber.'
    );
    const tab = await listInvoices(actor, { tab: 'x' });
    expect(JSON.stringify(tab.fieldErrors)).toContain('Unknown tab. Allowed: all, drafts, final.');
    const status = await listInvoices(actor, { status: 'x' });
    expect(JSON.stringify(status.fieldErrors)).toContain('Unknown status.');
    const range = await listInvoices(actor, { dateFrom: '2026-09-30', dateTo: '2026-09-01' });
    expect(JSON.stringify(range.fieldErrors)).toContain(DATE_MESSAGE);
  });

  it('AC-26: filters by status, tab, customer, sender profile and sorts', async () => {
    const a = await seed('t13-a@example.com');
    const other = await createCustomer(prisma, a.user.id, { name: '2 other' });
    const i1 = await a.make(1, { status: 'DRAFT' });
    const i2 = await a.make(2, { status: 'PAID' });
    const i3 = await a.make(3, { status: 'PENDING' }, { customer: other });
    const actor = await actingFreelancerForTest(a.user.id);

    expect(ids(await listInvoices(actor, { tab: 'drafts' }))).toEqual([i1.id]);
    expect(
      ids(await listInvoices(actor, { tab: 'final', sortField: 'invoiceNumber', sortDirection: 'asc' }))
    ).toEqual([i2.id, i3.id]);

    // the status filter applies only on the all tab; the tab wins otherwise
    expect(ids(await listInvoices(actor, { status: 'PAID' }))).toEqual([i2.id]);
    expect(ids(await listInvoices(actor, { tab: 'drafts', status: 'PAID' }))).toEqual([i1.id]);

    expect(ids(await listInvoices(actor, { customerId: other.id }))).toEqual([i3.id]);
    expect(
      ids(
        await listInvoices(actor, {
          senderProfileId: a.senderProfile.id,
          sortField: 'invoiceNumber',
          sortDirection: 'desc',
        })
      )
    ).toEqual([i3.id, i2.id, i1.id]);
  });

  // Three invoices whose values rank differently on every field, so one field cannot pass for another.
  it.each([
    ['createdAt', 'createdAt', [1, 3, 2]],
    ['issueDate', 'issueDate', [2, 1, 3]],
    ['dueDate', 'dueDate', [3, 2, 1]],
    ['total', 'total', [2, 3, 1]],
    ['invoiceNumber', 'invoiceNumber', [3, 1, 2]],
  ] as const)('AC-26: sorts by %s ascending and descending', async (_n, sortField, ascOrder) => {
    const a = await seed('t13-a@example.com');
    const fixtures = [
      { n: 1, invoiceNumber: 'C-0001', total: 300, issueDate: '2026-05-02', dueDate: '2026-07-03', createdAt: '2026-04-01' },
      { n: 2, invoiceNumber: 'D-0002', total: 100, issueDate: '2026-05-01', dueDate: '2026-07-02', createdAt: '2026-04-03' },
      { n: 3, invoiceNumber: 'A-0003', total: 200, issueDate: '2026-05-03', dueDate: '2026-07-01', createdAt: '2026-04-02' },
    ];
    const byN = new Map<number, string>();
    for (const f of fixtures) {
      const inv = await a.make(f.n, {
        invoiceNumber: f.invoiceNumber,
        total: f.total,
        issueDate: new Date(`${f.issueDate}T10:00:00Z`),
        dueDate: new Date(`${f.dueDate}T10:00:00Z`),
      });
      await prisma.invoice.update({ where: { id: inv.id }, data: { createdAt: new Date(`${f.createdAt}T10:00:00Z`) } });
      byN.set(f.n, inv.id);
    }
    const actor = await actingFreelancerForTest(a.user.id);
    const expected = ascOrder.map((n) => byN.get(n)!);
    expect(ids(await listInvoices(actor, { sortField, sortDirection: 'asc' }))).toEqual(expected);
    expect(ids(await listInvoices(actor, { sortField, sortDirection: 'desc' }))).toEqual([...expected].reverse());
  });

  it('AC-26: equal sort values paginate by id without repeat or skip', async () => {
    const a = await seed('t13-a@example.com');
    const issueDate = new Date('2026-05-05T10:00:00Z');
    for (let i = 1; i <= 5; i++) await a.make(i, { issueDate });
    const actor = await actingFreelancerForTest(a.user.id);
    const seen: string[] = [];
    for (let p = 1; p <= 3; p++) {
      seen.push(...ids(await listInvoices(actor, { sortField: 'issueDate', page: p, pageSize: 2 })));
    }
    expect(new Set(seen).size).toBe(5);
  });

  it('AC-21: the invoice issued on 1 October is October, not September', async () => {
    const a = await seed('t13-a@example.com');
    const inv = await a.make(1, { issueDate: new Date('2026-10-01T00:00:00Z') }); // a calendar day (T25)
    const kyiv = await actingFreelancerForTest(a.user.id, 'Europe/Kyiv');
    const sept = { dateFrom: '2026-09-01', dateTo: '2026-09-30' };
    const oct = { dateFrom: '2026-10-01', dateTo: '2026-10-31' };
    expect((await listInvoices(kyiv, sept)).data.items).toHaveLength(0);
    expect(ids(await listInvoices(kyiv, oct))).toEqual([inv.id]);
  });

  it('AC-22: no or unknown time zone compares the stored day the same way', async () => {
    const a = await seed('t13-a@example.com');
    const inv = await a.make(1, { issueDate: new Date('2026-09-30T00:00:00Z') });
    const sept = { dateFrom: '2026-09-01', dateTo: '2026-09-30' };
    for (const tz of [undefined, 'Not/AZone']) {
      const actor = await actingFreelancerForTest(a.user.id, tz);
      expect(ids(await listInvoices(actor, sept))).toEqual([inv.id]);
    }
  });

  it("AC-08: another freelancer's customer or sender profile filter returns an empty page", async () => {
    const a = await seed('t13-a@example.com');
    const b = await seed('t13-b@example.com');
    await a.make(1);
    await b.make(1);
    const actor = await actingFreelancerForTest(a.user.id);
    for (const q of [
      { customerId: b.customer.id },
      { senderProfileId: b.senderProfile.id },
      { customerId: 'nope' },
    ]) {
      const res = await listInvoices(actor, q);
      expect(res.success).toBe(true);
      expect(res.data).toMatchObject({ items: [], total: 0 });
    }
  });

  it('the unused list-all getInvoices() is deleted from the invoice actions', () => {
    const source = readFileSync('lib/actions/invoice-actions/invoice-actions.ts', 'utf8');
    expect(source).not.toMatch(/export\s+async\s+function\s+getInvoices\s*\(/);
  });
});
