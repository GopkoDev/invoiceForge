// T12 (spec.md §5 AC-07, AC-09, AC-25; public-api.md §2.6) — request-free invoice reads against a
// real throwaway Postgres: getInvoice, getInvoiceEditorData, peekNextInvoiceNumber, plus the
// foreign-record outcome for every id-taking function. No session, no next/*.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../../support/db/container';
import { createTestPrismaClient } from '../../../support/db/client';
import { truncateAllTables } from '../../../support/db/truncate';
import { createFreelancer } from '../../../support/factories/user';
import { createCustomer } from '../../../support/factories/customer';
import { createProduct } from '../../../support/factories/product';
import { createSenderProfile } from '../../../support/factories/sender-profile';
import { createBankAccount } from '../../../support/factories/bank-account';
import { createCustomPrice } from '../../../support/factories/custom-price';
import { createInvoice } from '../../../support/factories/invoice';
import { actingFreelancerForTest } from '../../../support/acting-freelancer';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

type Result = {
  success: boolean;
  code?: string;
  error?: string;
  data?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
};
type Svc = {
  getInvoice: (a: unknown, id: string) => Promise<Result>;
  getInvoiceEditorData: (a: unknown, invoiceId?: string) => Promise<Result>;
  peekNextInvoiceNumber: (a: unknown, senderProfileId: string) => Promise<Result>;
};

describe.runIf(containerRuntimeAvailable)('invoice reads service (T12, AC-07, AC-09, AC-25)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;
  let svc: Svc;
  let numbering: Record<string, unknown>;

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    prisma = createTestPrismaClient(db.connectionString);
    const invoices = (await import('@/lib/services/invoices/invoices')) as unknown as Partial<Svc>;
    const editor = (await import('@/lib/services/invoices/editor-data')) as unknown as Partial<Svc>;
    svc = {
      getInvoice: invoices.getInvoice!,
      peekNextInvoiceNumber: invoices.peekNextInvoiceNumber!,
      getInvoiceEditorData: editor.getInvoiceEditorData!,
    };
    numbering = await import('@/lib/services/invoices/numbering');
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  afterEach(async () => {
    await truncateAllTables(prisma);
  });

  async function seedFor(email: string) {
    const user = await createFreelancer(prisma, { email });
    const senderProfile = await createSenderProfile(prisma, user.id, { invoiceCounter: 4 });
    const bankAccount = await createBankAccount(prisma, senderProfile.id);
    const customer = await createCustomer(prisma, user.id, { name: '1 cust' });
    const product = await createProduct(prisma, user.id, { name: '1 prod', price: 100 });
    const invoice = await createInvoice(prisma, { senderProfile, customer, bankAccount });
    return { user, senderProfile, bankAccount, customer, product, invoice };
  }

  it('numbering module lives in lib/services/invoices', async () => {
    expect(typeof numbering.normalizeInvoiceNumber).toBe('function');
    expect(typeof numbering.allocateInvoiceNumber).toBe('function');
  });

  it('getInvoice returns the own invoice with its legacy info', async () => {
    const a = await seedFor('t12-a@example.com');
    const actor = await actingFreelancerForTest(a.user.id);
    const res = await svc.getInvoice(actor, a.invoice.id);
    expect(res.success).toBe(true);
    expect(res.data).toMatchObject({ id: a.invoice.id, invoiceNumber: a.invoice.invoiceNumber });
    expect(res.data).toHaveProperty('legacy');
    expect(res.data.items).toHaveLength(1);
  });

  it("getInvoice with B's id is NOT_FOUND like a missing one, B's row unchanged", async () => {
    const a = await seedFor('t12-a@example.com');
    const b = await seedFor('t12-b@example.com');
    const actor = await actingFreelancerForTest(a.user.id);
    const before = await prisma.invoice.findUniqueOrThrow({ where: { id: b.invoice.id } });
    const foreign = await svc.getInvoice(actor, b.invoice.id);
    expect(foreign).toMatchObject({ success: false, code: 'NOT_FOUND', error: 'Invoice not found.' });
    expect(foreign).toEqual(await svc.getInvoice(actor, 'does-not-exist'));
    expect(await prisma.invoice.findUniqueOrThrow({ where: { id: b.invoice.id } })).toEqual(before);
  });

  it("getInvoiceEditorData carries A's data only, with the Customer's custom price (AC-25)", async () => {
    const a = await seedFor('t12-a@example.com');
    await seedFor('t12-b@example.com');
    const cp = await createCustomPrice(prisma, a.product.id, a.customer.id, { price: 77 });
    const actor = await actingFreelancerForTest(a.user.id);
    const res = await svc.getInvoiceEditorData(actor);
    expect(res.success).toBe(true);
    expect(res.data.customers.map((c: { id: string }) => c.id)).toEqual([a.customer.id]);
    expect(res.data.products.map((p: { id: string }) => p.id)).toEqual([a.product.id]);
    expect(res.data.senderProfiles.map((p: { id: string }) => p.id)).toEqual([a.senderProfile.id]);
    expect(res.data.bankAccounts.map((x: { id: string }) => x.id)).toEqual([a.bankAccount.id]);
    expect(res.data.customPrices).toHaveLength(1);
    expect(res.data.customPrices[0]).toMatchObject({
      id: cp.id,
      customerId: a.customer.id,
      productId: a.product.id,
    });
    expect(Number(res.data.customPrices[0].price)).toBe(77);
    expect(res.data.initialData).toBeUndefined();
  });

  it('getInvoiceEditorData with an own invoice id returns the invoice form data and legacy info', async () => {
    const a = await seedFor('t12-a@example.com');
    const actor = await actingFreelancerForTest(a.user.id);
    const res = await svc.getInvoiceEditorData(actor, a.invoice.id);
    expect(res.success).toBe(true);
    expect(res.data.invoiceId).toBe(a.invoice.id);
    expect(res.data.initialData).toBeDefined();
    expect(res.data).toHaveProperty('legacy');
  });

  it("getInvoiceEditorData with B's invoice id is NOT_FOUND like a missing one", async () => {
    const a = await seedFor('t12-a@example.com');
    const b = await seedFor('t12-b@example.com');
    const actor = await actingFreelancerForTest(a.user.id);
    const before = await prisma.invoice.findUniqueOrThrow({ where: { id: b.invoice.id } });
    const foreign = await svc.getInvoiceEditorData(actor, b.invoice.id);
    expect(foreign).toMatchObject({ success: false, code: 'NOT_FOUND' });
    expect(foreign).toEqual(await svc.getInvoiceEditorData(actor, 'does-not-exist'));
    expect(await prisma.invoice.findUniqueOrThrow({ where: { id: b.invoice.id } })).toEqual(before);
  });

  it('peekNextInvoiceNumber returns the next free number twice without advancing the counter', async () => {
    const a = await seedFor('t12-a@example.com');
    const actor = await actingFreelancerForTest(a.user.id);
    const year = new Date().getFullYear();
    const expected = `${a.senderProfile.invoicePrefix}-${year}-0005`;
    const first = await svc.peekNextInvoiceNumber(actor, a.senderProfile.id);
    expect(first).toEqual({ success: true, data: expected });
    expect(await svc.peekNextInvoiceNumber(actor, a.senderProfile.id)).toEqual(first);
    const row = await prisma.senderProfile.findUniqueOrThrow({ where: { id: a.senderProfile.id } });
    expect(row.invoiceCounter).toBe(4);
  });

  it("peekNextInvoiceNumber with B's profile is NOT_FOUND, B's counter unchanged", async () => {
    const a = await seedFor('t12-a@example.com');
    const b = await seedFor('t12-b@example.com');
    const actor = await actingFreelancerForTest(a.user.id);
    const foreign = await svc.peekNextInvoiceNumber(actor, b.senderProfile.id);
    expect(foreign).toMatchObject({
      success: false,
      code: 'NOT_FOUND',
      error: 'Sender profile not found.',
    });
    expect(foreign).toEqual(await svc.peekNextInvoiceNumber(actor, 'does-not-exist'));
    const row = await prisma.senderProfile.findUniqueOrThrow({ where: { id: b.senderProfile.id } });
    expect(row.invoiceCounter).toBe(4);
  });
});
