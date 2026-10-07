// T16 (spec.md §5 AC-08, AC-17, AC-21): customer name matching (current + invoice-copied names) and
// the Assistant invoice search, through the real business layer on a throwaway database.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../../support/db/container';
import { createTestPrismaClient } from '../../../support/db/client';
import { truncateAllTables } from '../../../support/db/truncate';
import { actingFreelancerForTest } from '../../../support/acting-freelancer';
import { createCustomer } from '../../../support/factories/customer';
import { createSenderProfile } from '../../../support/factories/sender-profile';
import { createBankAccount } from '../../../support/factories/bank-account';
import { createInvoice } from '../../../support/factories/invoice';
import { KYIV, addInvoice, seedFreelancer } from '../dashboard/harness';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

let testClient: PrismaClient;
vi.mock('@/prisma', () => ({ prisma: new Proxy({}, { get: (_t, k) => (testClient as never)[k] }) }));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, unstable_cache: (fn: () => unknown) => fn }));

type Search = typeof import('@/lib/services/invoices/assistant-search');
type Customers = typeof import('@/lib/services/customers/customers');

function data<T>(r: { success: true; data: T } | { success: false; code: string; error: string }): T {
  if (!r.success) throw new Error(`expected success, got ${r.code}: ${r.error}`);
  return r.data;
}

const at = (iso: string) => new Date(iso);

describe.runIf(containerRuntimeAvailable)('Assistant customer match and invoice search (T16)', () => {
  let db: TestDatabase;
  let search: Search;
  let customers: Customers;

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    testClient = createTestPrismaClient(db.connectionString);
    search = await import('@/lib/services/invoices/assistant-search');
    customers = await import('@/lib/services/customers/customers');
  }, 60_000);

  afterAll(async () => {
    await testClient?.$disconnect();
    await db?.stop();
  });

  afterEach(async () => {
    vi.useRealTimers();
    await truncateAllTables(testClient);
  });

  it('AC-17: 120 issued + 4 drafts -> issued only, 50 per page, totals over every match', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-08-10T10:00:00Z'));
    const s = await seedFreelancer(testClient, ['USD', 'EUR']);
    for (let i = 0; i < 120; i++) {
      await addInvoice(s, {
        currency: i % 3 === 0 ? 'EUR' : 'USD',
        status: i % 2 === 0 ? 'PAID' : 'PENDING',
        total: 10.1,
        issueDate: at('2026-07-01T09:00:00Z'),
        dueDate: at('2026-09-01T00:00:00Z'),
      });
    }
    for (let i = 0; i < 4; i++) await addInvoice(s, { currency: 'USD', status: 'DRAFT', total: 999 });
    const actor = await actingFreelancerForTest(s.userId, KYIV);

    const p1 = data(await search.searchInvoicesForAssistant(actor, { customerId: s.customer.id, pageSize: 100 }));
    expect(p1.today).toBe('2026-08-10');
    expect(p1.timeZone).toBe(KYIV);
    expect(p1.rows).toHaveLength(50);
    expect(p1.rows.every((r) => r.status === 'pending' || r.status === 'paid')).toBe(true);
    expect(p1.pageInfo).toMatchObject({ page: 1, pageSize: 50, pageSizeCapped: true, total: 120, totalPages: 3, hasMore: true });
    expect(p1.totals).toEqual([
      { currency: 'EUR', total: '404.00', count: 40 },
      { currency: 'USD', total: '808.00', count: 80 },
    ]);

    const p3 = data(await search.searchInvoicesForAssistant(actor, { customerId: s.customer.id, page: 3, pageSize: 50 }));
    expect(p3.rows).toHaveLength(20);
    expect(p3.pageInfo.hasMore).toBe(false);
    expect(p3.totals).toEqual(p1.totals);

    const p4 = await search.searchInvoicesForAssistant(actor, { customerId: s.customer.id, page: 4, pageSize: 50 });
    expect(p4).toMatchObject({ success: false, code: 'NOT_FOUND', details: { kind: 'PAGE_OUT_OF_RANGE' } });
  }, 120_000);

  it('AC-17: drafts and cancelled appear only when asked, labelled; pending past due is overdue', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-08-10T10:00:00Z'));
    const s = await seedFreelancer(testClient, ['USD']);
    const past = at('2026-08-01T00:00:00Z');
    const future = at('2026-09-01T00:00:00Z');
    const pendingPast = await addInvoice(s, { currency: 'USD', status: 'PENDING', total: 10, dueDate: past });
    const pendingFuture = await addInvoice(s, { currency: 'USD', status: 'PENDING', total: 20, dueDate: future });
    await addInvoice(s, { currency: 'USD', status: 'PAID', total: 30, dueDate: past });
    const draft = await addInvoice(s, { currency: 'USD', status: 'DRAFT', total: 40, dueDate: future });
    const cancelled = await addInvoice(s, { currency: 'USD', status: 'CANCELLED', total: 50, dueDate: future });
    const actor = await actingFreelancerForTest(s.userId, KYIV);

    const def = data(await search.searchInvoicesForAssistant(actor, {}));
    expect(def.pageInfo.total).toBe(3);
    expect(def.rows.map((r) => r.status).sort()).toEqual(['overdue', 'paid', 'pending']);
    const overdueRow = def.rows.find((r) => r.invoiceId === pendingPast.id)!;
    expect(overdueRow).toMatchObject({ status: 'overdue', daysOverdue: 9, dueDate: '2026-08-01', amount: '10.00' });
    expect(def.rows.find((r) => r.invoiceId === pendingFuture.id)).toMatchObject({ status: 'pending', daysOverdue: null });

    const pend = data(await search.searchInvoicesForAssistant(actor, { status: ['pending'] }));
    expect(pend.rows.map((r) => r.invoiceId)).toEqual([pendingFuture.id]);

    const drafts = data(await search.searchInvoicesForAssistant(actor, { status: ['draft'] }));
    expect(drafts.rows.map((r) => [r.invoiceId, r.status])).toEqual([[draft.id, 'draft']]);
    expect(drafts.totals).toEqual([{ currency: 'USD', total: '40.00', count: 1 }]);

    const both = data(await search.searchInvoicesForAssistant(actor, { status: ['draft', 'cancelled'] }));
    expect(both.rows.map((r) => r.invoiceId).sort()).toEqual([draft.id, cancelled.id].sort());
  });

  it('AC-17: narrows by sender profile, issue range, due range and invoice-number part; notes and lines are not searched', async () => {
    const s = await seedFreelancer(testClient, ['USD']);
    const profile2 = await createSenderProfile(testClient, s.userId, { name: 'Second Studio', isDefault: false });
    const bank2 = await createBankAccount(testClient, profile2.id, { currency: 'USD' });
    const a = await addInvoice(s, { currency: 'USD', status: 'PAID', total: 1, issueDate: at('2026-03-10T09:00:00Z'), dueDate: at('2026-03-20T00:00:00Z') });
    const b = await addInvoice(s, { currency: 'USD', status: 'PAID', total: 2, issueDate: at('2026-04-10T09:00:00Z'), dueDate: at('2026-04-20T00:00:00Z') });
    const c = await createInvoice(testClient, {
      senderProfile: profile2,
      customer: s.customer,
      bankAccount: bank2,
      items: [{ name: 'zebra-lines', quantity: 1, rate: 3, amount: 3 }],
      overrides: { invoiceNumber: 'ZED-777', status: 'PAID', total: 3, subtotal: 3, currency: 'USD', notes: 'giraffe-notes', issueDate: at('2026-05-10T09:00:00Z'), dueDate: at('2026-05-20T00:00:00Z') },
    });
    const actor = await actingFreelancerForTest(s.userId, KYIV);
    const ids = async (input: object) =>
      data(await search.searchInvoicesForAssistant(actor, input)).rows.map((r) => r.invoiceId);

    expect(await ids({})).toEqual([c.id, b.id, a.id]); // issue date descending
    expect(await ids({ senderProfile: 'second' })).toEqual([c.id]);
    expect(await ids({ senderProfileId: profile2.id })).toEqual([c.id]);
    expect(await ids({ issueDateFrom: '2026-04-01', issueDateTo: '2026-04-30' })).toEqual([b.id]);
    expect(await ids({ issueDateFrom: '2026-04-10' })).toEqual([c.id, b.id]);
    expect(await ids({ dueDateTo: '2026-03-20' })).toEqual([a.id]);
    expect(await ids({ dueDateFrom: '2026-04-20', dueDateTo: '2026-05-20' })).toEqual([c.id, b.id]);
    expect(await ids({ invoiceNumber: ' zed-7 ' })).toEqual([c.id]);
    expect(await ids({ invoiceNumber: '%' })).toEqual([]);
    expect(await search.searchInvoicesForAssistant(actor, { senderProfile: 'giraffe' })).toMatchObject({ success: false, code: 'NOT_FOUND' });
    expect(await ids({ invoiceNumber: 'giraffe-notes' })).toEqual([]);
    expect(await ids({ invoiceNumber: 'zebra-lines' })).toEqual([]);
  });

  it('AC-21: a renamed Customer is found under both names, ignoring case, and by part of a name', async () => {
    const s = await seedFreelancer(testClient, ['USD']);
    const acme = await createCustomer(testClient, s.userId, { name: 'Acme GmbH' });
    const old = await addInvoice(s, { currency: 'USD', status: 'PAID', total: 1, customer: acme, customerName: 'Acme Ltd', issueDate: at('2026-01-01T09:00:00Z') });
    const cur = await addInvoice(s, { currency: 'USD', status: 'PAID', total: 2, customer: acme, issueDate: at('2026-02-01T09:00:00Z') });
    await addInvoice(s, { currency: 'USD', status: 'PAID', total: 3, issueDate: at('2026-02-02T09:00:00Z') }); // other customer
    const actor = await actingFreelancerForTest(s.userId, KYIV);

    for (const q of ['Acme GmbH', 'Acme Ltd', 'acme', 'ACME LTD', 'mbh']) {
      const res = data(await search.searchInvoicesForAssistant(actor, { customer: q }));
      expect(res.rows.map((r) => r.invoiceId), q).toEqual([cur.id, old.id]);
      expect(res.rows.every((r) => r.customer.customerId === acme.id)).toBe(true);
    }

    const one = data(await customers.resolveCustomerByName(actor, 'acme ltd'));
    expect(one).toMatchObject({ kind: 'one', customerId: acme.id });
  });

  it('AC-21: several matching Customers are listed as candidates, nothing is searched', async () => {
    const s = await seedFreelancer(testClient, ['USD']);
    const a = await createCustomer(testClient, s.userId, { name: 'Acme GmbH', email: 'a@acme.test' });
    const b = await createCustomer(testClient, s.userId, { name: 'Other', email: 'b@other.test' });
    await addInvoice(s, { currency: 'USD', status: 'PAID', total: 1, customer: b, customerName: 'Acme Ltd' });
    const actor = await actingFreelancerForTest(s.userId, KYIV);

    const res = await search.searchInvoicesForAssistant(actor, { customer: 'acme' });
    expect(res).toMatchObject({
      success: false,
      code: 'VALIDATION',
      details: { kind: 'AMBIGUOUS_REFERENCE', reference: 'customer' },
    });
    const candidates = (res as { details: { candidates: { id: string; name: string }[] } }).details.candidates;
    expect(candidates.map((c) => c.id).sort()).toEqual([a.id, b.id].sort());
    expect(candidates.find((c) => c.id === a.id)?.name).toBe('Acme GmbH');
  });

  it('a sender-profile name matching several profiles is ambiguous', async () => {
    const s = await seedFreelancer(testClient, ['USD']);
    await createSenderProfile(testClient, s.userId, { name: `${s.profile.name} Two`, isDefault: false });
    const actor = await actingFreelancerForTest(s.userId, KYIV);

    const res = await search.searchInvoicesForAssistant(actor, { senderProfile: s.profile.name });
    expect(res).toMatchObject({
      success: false,
      code: 'VALIDATION',
      details: { kind: 'AMBIGUOUS_REFERENCE', reference: 'senderProfile' },
    });
    expect((res as { details: { candidates: unknown[] } }).details.candidates).toHaveLength(2);
  });

  it('resolveSenderProfileByName answers none, one or candidates among the own profiles only', async () => {
    const { resolveSenderProfileByName } = await import('@/lib/services/sender-profiles/resolve-by-name');
    const a = await seedFreelancer(testClient, ['USD']);
    await testClient.senderProfile.update({ where: { id: a.profileId }, data: { name: 'Alpha Studio' } });
    const second = await createSenderProfile(testClient, a.userId, { name: 'Alpha Labs', isDefault: false });
    const b = await seedFreelancer(testClient, ['USD']);
    await testClient.senderProfile.update({ where: { id: b.profileId }, data: { name: 'Bravo Studio' } });
    const actor = await actingFreelancerForTest(a.userId, KYIV);

    expect(await resolveSenderProfileByName(actor, 'bravo')).toEqual({ success: true, data: { kind: 'none' } });
    expect(await resolveSenderProfileByName(actor, 'LABS')).toEqual({
      success: true,
      data: { kind: 'one', senderProfileId: second.id, name: 'Alpha Labs' },
    });
    const many = data(await resolveSenderProfileByName(actor, 'alpha'));
    expect(many.kind).toBe('candidates');
  });

  it('an id and a name for the same record together are a validation failure', async () => {
    const s = await seedFreelancer(testClient, ['USD']);
    const actor = await actingFreelancerForTest(s.userId, KYIV);
    expect(await search.searchInvoicesForAssistant(actor, { customerId: s.customer.id, customer: 'x' })).toMatchObject({ success: false, code: 'VALIDATION' });
    expect(await search.searchInvoicesForAssistant(actor, { senderProfileId: s.profileId, senderProfile: 'x' })).toMatchObject({ success: false, code: 'VALIDATION' });
  });

  it("AC-08: another Freelancer's Customer or sender profile answers exactly like a missing one", async () => {
    const a = await seedFreelancer(testClient, ['USD']);
    const b = await seedFreelancer(testClient, ['USD']);
    await testClient.senderProfile.update({ where: { id: b.profileId }, data: { name: 'Bravo Studio' } });
    b.profile.name = 'Bravo Studio';
    const bCustomer = await createCustomer(testClient, b.userId, { name: 'Bravo Secret Corp' });
    await addInvoice(b, { currency: 'USD', status: 'PAID', total: 5, customer: bCustomer, customerName: 'Bravo Old Name' });
    const actor = await actingFreelancerForTest(a.userId, KYIV);

    const same = async (real: object, fake: object) => {
      const r = await search.searchInvoicesForAssistant(actor, real);
      const f = await search.searchInvoicesForAssistant(actor, fake);
      expect(r).toMatchObject({ success: false, code: 'NOT_FOUND' });
      expect(r).toEqual(f);
    };
    await same({ customer: 'Bravo Secret' }, { customer: 'Nonexistent Name' });
    await same({ customer: 'Bravo Old' }, { customer: 'Nonexistent Name' });
    await same({ customerId: bCustomer.id }, { customerId: 'c_does_not_exist' });
    await same({ senderProfile: b.profile.name }, { senderProfile: 'Nonexistent Profile' });
    await same({ senderProfileId: b.profileId }, { senderProfileId: 'sp_does_not_exist' });

    expect(await customers.resolveCustomerByName(actor, 'Bravo')).toEqual({ success: true, data: { kind: 'none' } });
    const listed = data(await customers.listCustomersForAssistant(actor, {}));
    expect(listed.rows.map((r) => r.customerId)).toEqual([a.customer.id]);
    expect(data(await customers.listCustomersForAssistant(actor, { name: 'Bravo' })).rows).toEqual([]);
  });

  it('lists Customers by name then id with current details, a name filter on current and copied names, strict paging', async () => {
    const s = await seedFreelancer(testClient, ['USD']);
    const zed = await createCustomer(testClient, s.userId, { name: 'Zed', companyName: 'Zed Co', phone: '123', city: 'Kyiv', defaultCurrency: 'EUR' });
    const beta = await createCustomer(testClient, s.userId, { name: 'Beta', notes: 'private note', website: 'https://b.test' });
    await addInvoice(s, { currency: 'USD', status: 'PAID', total: 1, customer: beta, customerName: 'Gamma Ltd' });
    const actor = await actingFreelancerForTest(s.userId, KYIV);

    const all = data(await customers.listCustomersForAssistant(actor, {}));
    expect(all.rows.map((r) => r.name)).toEqual([beta.name, s.customer.name, zed.name].sort());
    expect(all.rows.find((r) => r.customerId === zed.id)).toEqual({
      customerId: zed.id,
      name: 'Zed',
      companyName: 'Zed Co',
      email: zed.email,
      phone: '123',
      taxId: null,
      address: null,
      city: 'Kyiv',
      country: null,
      postalCode: null,
      defaultCurrency: 'EUR',
    });
    expect(JSON.stringify(all)).not.toContain('private note');
    expect(all.pageInfo).toMatchObject({ page: 1, total: 3, totalPages: 1, hasMore: false });

    expect(data(await customers.listCustomersForAssistant(actor, { name: 'gamma' })).rows.map((r) => r.customerId)).toEqual([beta.id]);
    expect(data(await customers.listCustomersForAssistant(actor, { name: '  ' })).pageInfo.total).toBe(3);

    const paged = data(await customers.listCustomersForAssistant(actor, { page: 2, pageSize: 2 }));
    expect(paged.rows).toHaveLength(1);
    expect(paged.pageInfo).toMatchObject({ total: 3, totalPages: 2, hasMore: false });
    expect(await customers.listCustomersForAssistant(actor, { page: 3, pageSize: 2 })).toMatchObject({
      success: false,
      code: 'NOT_FOUND',
      details: { kind: 'PAGE_OUT_OF_RANGE' },
    });
  });
});
