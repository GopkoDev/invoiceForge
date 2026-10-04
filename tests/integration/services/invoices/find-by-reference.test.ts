// T17 (spec.md §5 AC-08, AC-19, AC-20): one invoice by id or by number, through the real business
// layer on a throwaway database.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../../support/db/container';
import { createTestPrismaClient } from '../../../support/db/client';
import { truncateAllTables } from '../../../support/db/truncate';
import { actingFreelancerForTest } from '../../../support/acting-freelancer';
import { createSenderProfile } from '../../../support/factories/sender-profile';
import { createBankAccount } from '../../../support/factories/bank-account';
import { createInvoice } from '../../../support/factories/invoice';
import { KYIV, addInvoice, seedFreelancer, type Seed } from '../dashboard/harness';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

let testClient: PrismaClient;
vi.mock('@/prisma', () => ({ prisma: new Proxy({}, { get: (_t, k) => (testClient as never)[k] }) }));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, unstable_cache: (fn: () => unknown) => fn }));

type Find = typeof import('@/lib/services/invoices/find-by-reference');

const NOT_FOUND = 'No invoice matches that reference. Check the number or ask the Freelancer for it.';

function data<T>(r: { success: true; data: T } | { success: false; code: string; error: string }): T {
  if (!r.success) throw new Error(`expected success, got ${r.code}: ${r.error}`);
  return r.data;
}

/** A second sender profile (with its own bank account) for the same Freelancer. */
async function secondProfile(s: Seed, name: string) {
  const profile = await createSenderProfile(s.prisma, s.userId, { name, isDefault: false });
  const bank = await createBankAccount(s.prisma, profile.id, { currency: 'USD', isDefault: true });
  return { profile, bank };
}

describe.runIf(containerRuntimeAvailable)('Find one invoice by reference (T17)', () => {
  let db: TestDatabase;
  let find: Find;

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    testClient = createTestPrismaClient(db.connectionString);
    find = await import('@/lib/services/invoices/find-by-reference');
  }, 60_000);

  afterAll(async () => {
    await testClient?.$disconnect();
    await db?.stop();
  });

  afterEach(async () => {
    vi.useRealTimers();
    await truncateAllTables(testClient);
  });

  it('AC-19: returns the invoice as stored, copied details, lines, amounts, and no bank fields', async () => {
    const s = await seedFreelancer(testClient, ['USD']);
    const inv = await createInvoice(testClient, {
      senderProfile: s.profile,
      customer: s.customer,
      bankAccount: s.bank.USD,
      items: [
        { name: 'Design', description: 'Logo', unit: 'h', quantity: 2, rate: 50, amount: 100 },
        { name: 'Hosting', quantity: 1, rate: 20, amount: 20 },
      ],
      overrides: {
        invoiceNumber: 'INV-0001',
        status: 'PENDING',
        subtotal: 120,
        taxRate: 10,
        taxAmount: 12,
        discount: 2,
        shipping: 5,
        total: 135,
        amountPaid: 15,
        currency: 'USD',
        dueDate: new Date('2099-01-01T00:00:00Z'),
        paymentTerms: 'Net 30',
        terms: 'T&C',
        notes: 'Thanks',
        poNumber: 'PO-7',
        customerName: 'Copied Name Ltd',
      },
    });
    // The Customer is renamed after issue: the answer keeps the copied name.
    await testClient.customer.update({ where: { id: s.customer.id }, data: { name: 'Renamed Later' } });
    const actor = await actingFreelancerForTest(s.userId, KYIV);

    const a = data(await find.findInvoiceByReference(actor, { invoiceId: inv.id }));
    expect(a).toMatchObject({
      invoiceId: inv.id,
      invoiceNumber: 'INV-0001',
      status: 'pending',
      daysOverdue: null,
      currency: 'USD',
      dueDate: '2099-01-01',
      sender: { senderProfileId: s.profileId, name: s.profile.name },
      customer: { customerId: s.customer.id, name: 'Copied Name Ltd' },
      amounts: { subtotal: '120.00', taxRate: '10.00', taxAmount: '12.00', discount: '2.00', shipping: '5.00', total: '135.00', amountPaid: '15.00' },
      paymentTerms: 'Net 30',
      terms: 'T&C',
      notes: 'Thanks',
      poNumber: 'PO-7',
    });
    expect(a.lines).toHaveLength(2);
    expect(a.lines.find((l) => l.name === 'Design')).toMatchObject({ description: 'Logo', unit: 'h', quantity: '2.00', rate: '50.00', amount: '100.00' });

    const text = JSON.stringify(a);
    for (const key of ['bankName', 'accountName', 'bankAccountNumber', 'bankIban', 'bankSwift']) expect(text).not.toContain(key);
    for (const v of [s.bank.USD.accountNumber, s.bank.USD.iban, s.bank.USD.swift].filter(Boolean)) expect(text).not.toContain(String(v));
  });

  it('AC-19: draft and cancelled are returned and labelled; pending past due is overdue, stored unchanged', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-08-10T10:00:00Z'));
    const s = await seedFreelancer(testClient, ['USD']);
    const draft = await addInvoice(s, { currency: 'USD', status: 'DRAFT', total: 1 });
    const cancelled = await addInvoice(s, { currency: 'USD', status: 'CANCELLED', total: 1 });
    const late = await addInvoice(s, { currency: 'USD', status: 'PENDING', total: 1, dueDate: new Date('2026-08-01T00:00:00Z') });
    const actor = await actingFreelancerForTest(s.userId, KYIV);

    expect(data(await find.findInvoiceByReference(actor, { invoiceId: draft.id })).status).toBe('draft');
    expect(data(await find.findInvoiceByReference(actor, { invoiceId: cancelled.id })).status).toBe('cancelled');
    const o = data(await find.findInvoiceByReference(actor, { invoiceId: late.id }));
    expect(o).toMatchObject({ status: 'overdue', daysOverdue: 9 });
    expect((await testClient.invoice.findUniqueOrThrow({ where: { id: late.id } })).status).toBe('PENDING');
  });

  it('by number: normalized (case, spaces) and found across the Freelancer sender profiles', async () => {
    const s = await seedFreelancer(testClient, ['USD']);
    const inv = await createInvoice(testClient, {
      senderProfile: s.profile,
      customer: s.customer,
      bankAccount: s.bank.USD,
      overrides: { invoiceNumber: 'INV-0012', status: 'PENDING' },
    });
    const actor = await actingFreelancerForTest(s.userId, KYIV);
    const a = data(await find.findInvoiceByReference(actor, { invoiceNumber: ' inv-0012 ' }));
    expect(a.invoiceId).toBe(inv.id);
    // Whole number only: a prefix of it does not match.
    expect(await find.findInvoiceByReference(actor, { invoiceNumber: 'INV-001' })).toMatchObject({ success: false, code: 'NOT_FOUND' });
  });

  it('AC-20: the same number in two sender profiles, none named -> both candidates; naming one picks it', async () => {
    const s = await seedFreelancer(testClient, ['USD']);
    const other = await secondProfile(s, 'Second Studio');
    const customer2 = await testClient.customer.create({ data: { userId: s.userId, name: 'Other Customer' } });
    const a = await createInvoice(testClient, {
      senderProfile: s.profile,
      customer: s.customer,
      bankAccount: s.bank.USD,
      overrides: { invoiceNumber: 'INV-0012', status: 'PENDING', issueDate: new Date('2026-07-01T09:00:00Z') },
    });
    const b = await createInvoice(testClient, {
      senderProfile: other.profile,
      customer: customer2,
      bankAccount: other.bank,
      overrides: { invoiceNumber: 'INV-0012', status: 'PENDING', issueDate: new Date('2026-07-02T09:00:00Z') },
    });
    const actor = await actingFreelancerForTest(s.userId, KYIV);

    const r = await find.findInvoiceByReference(actor, { invoiceNumber: 'INV-0012' });
    expect(r).toMatchObject({
      success: false,
      code: 'VALIDATION',
      details: { kind: 'AMBIGUOUS_REFERENCE', reference: 'invoice' },
    });
    if (r.success || r.details?.kind !== 'AMBIGUOUS_REFERENCE') throw new Error('unreachable');
    expect(r.details.candidates.map((c) => c.id).sort()).toEqual([a.id, b.id].sort());
    const ca = r.details.candidates.find((c) => c.id === a.id)!;
    expect(ca).toMatchObject({ name: 'INV-0012' });
    expect(ca.detail).toContain(s.profile.name);
    expect(ca.detail).toContain(s.customer.name);
    expect(ca.detail).toContain('2026-07-01');

    const picked = data(await find.findInvoiceByReference(actor, { invoiceNumber: 'INV-0012', senderProfile: 'second studio' }));
    expect(picked.invoiceId).toBe(b.id);
  });

  it('sender profile name: matching none -> NOT_FOUND; matching several -> AMBIGUOUS senderProfile', async () => {
    const s = await seedFreelancer(testClient, ['USD']);
    await createInvoice(testClient, {
      senderProfile: s.profile,
      customer: s.customer,
      bankAccount: s.bank.USD,
      overrides: { invoiceNumber: 'INV-0012', status: 'PENDING' },
    });
    await secondProfile(s, `${s.profile.name} Two`);
    const actor = await actingFreelancerForTest(s.userId, KYIV);

    expect(await find.findInvoiceByReference(actor, { invoiceNumber: 'INV-0012', senderProfile: 'nonexistent' })).toMatchObject({
      success: false,
      code: 'NOT_FOUND',
    });
    expect(await find.findInvoiceByReference(actor, { invoiceNumber: 'INV-0012', senderProfile: s.profile.name })).toMatchObject({
      success: false,
      code: 'VALIDATION',
      details: { kind: 'AMBIGUOUS_REFERENCE', reference: 'senderProfile' },
    });
  });

  it('AC-08: another Freelancer invoice (by id, number, or sender profile name) is answered like a missing one', async () => {
    const a = await seedFreelancer(testClient, ['USD']);
    const b = await seedFreelancer(testClient, ['USD']);
    const theirs = await createInvoice(testClient, {
      senderProfile: b.profile,
      customer: b.customer,
      bankAccount: b.bank.USD,
      overrides: { invoiceNumber: 'INV-0012', status: 'PENDING' },
    });
    const actor = await actingFreelancerForTest(a.userId, KYIV);

    const missing = await find.findInvoiceByReference(actor, { invoiceId: 'does-not-exist' });
    expect(missing).toMatchObject({ success: false, code: 'NOT_FOUND', error: NOT_FOUND });
    expect(await find.findInvoiceByReference(actor, { invoiceId: theirs.id })).toEqual(missing);
    expect(await find.findInvoiceByReference(actor, { invoiceNumber: 'INV-0012' })).toEqual(missing);
    expect(await find.findInvoiceByReference(actor, { invoiceNumber: 'INV-0012', senderProfile: b.profile.name })).toMatchObject({
      success: false,
      code: 'NOT_FOUND',
    });
  });

  it('rejects an empty reference or both id and number as VALIDATION', async () => {
    const s = await seedFreelancer(testClient, ['USD']);
    const actor = await actingFreelancerForTest(s.userId, KYIV);
    expect(await find.findInvoiceByReference(actor, {})).toMatchObject({ success: false, code: 'VALIDATION' });
    expect(await find.findInvoiceByReference(actor, { invoiceId: 'x', invoiceNumber: 'INV-1' })).toMatchObject({
      success: false,
      code: 'VALIDATION',
    });
  });
});
