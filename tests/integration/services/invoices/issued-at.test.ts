// T06 (spec.md §5 AC-23; data-model.md §Invoice write rules) — Invoice.issuedAt is set once on every
// path that moves an invoice out of DRAFT and is never cleared. No backfill.
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
import { createInvoice as seedInvoice } from '../../../support/factories/invoice';
import { actingFreelancerForTest } from '../../../support/acting-freelancer';
import { withLoadedVersion } from '../../../support/loaded-version';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

vi.mock('@sentry/nextjs', () => ({
  startSpan: (_options: unknown, callback: () => unknown) => callback(),
  captureMessage: vi.fn(),
}));

type Result = {
  success: boolean;
  data?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
};
type Svc = {
  createInvoice: (a: unknown, input: unknown) => Promise<Result>;
  updateInvoice: (a: unknown, id: string, input: unknown) => Promise<Result>;
  updateInvoiceStatus: (a: unknown, id: string, status: string) => Promise<Result>;
};

describe.runIf(containerRuntimeAvailable)('Invoice.issuedAt (T06, AC-23)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;
  let svc: Svc;

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    prisma = createTestPrismaClient(db.connectionString);
    svc = (await import('@/lib/services/invoices/invoices')) as unknown as Svc;
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  afterEach(async () => {
    await truncateAllTables(prisma);
  });

  async function seed() {
    const user = await createFreelancer(prisma, { email: 't06-issued@example.com' });
    const senderProfile = await createSenderProfile(prisma, user.id, { invoiceCounter: 4 });
    const bankAccount = await createBankAccount(prisma, senderProfile.id);
    const customer = await createCustomer(prisma, user.id, { name: '1 cust' });
    const actor = await actingFreelancerForTest(user.id);
    return { user, senderProfile, bankAccount, customer, actor };
  }
  type Seed = Awaited<ReturnType<typeof seed>>;

  function form(s: Seed, overrides: Record<string, unknown> = {}) {
    return {
      invoiceNumber: '',
      status: 'DRAFT',
      senderProfileId: s.senderProfile.id,
      bankAccountId: s.bankAccount.id,
      customerId: s.customer.id,
      issueDate: new Date().toISOString().slice(0, 10),
      dueDate: new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10),
      currency: 'USD',
      poNumber: '',
      paymentTerms: '',
      taxRate: 0,
      discount: 0,
      shipping: 0,
      notes: '',
      terms: '',
      items: [{ id: 'item-0', productName: 'Widget', unit: 'pcs', quantity: 1, price: 100, total: 100 }],
      ...overrides,
    };
  }
  const issuedAt = async (id: string) =>
    (await prisma.invoice.findUniqueOrThrow({ where: { id } })).issuedAt;

  async function seedDraft(s: Seed) {
    return seedInvoice(prisma, {
      senderProfile: s.senderProfile,
      customer: s.customer,
      bankAccount: s.bankAccount,
      items: [{ name: 'Widget', unit: 'pcs', quantity: 1, rate: 100, amount: 100 }],
      overrides: { invoiceNumber: '1-INV-1', status: 'DRAFT' },
    });
  }

  it('AC-23: created as a draft, issuedAt stays NULL', async () => {
    const s = await seed();
    const res = await svc.createInvoice(s.actor, form(s));
    expect(await issuedAt(res.data.id)).toBeNull();
  });

  it('AC-23: updateInvoiceStatus DRAFT -> PENDING sets issuedAt; later changes and a revert keep it', async () => {
    const s = await seed();
    const inv = await seedDraft(s);
    expect(await issuedAt(inv.id)).toBeNull();
    expect((await svc.updateInvoiceStatus(s.actor, inv.id, 'PENDING')).success).toBe(true);
    const first = await issuedAt(inv.id);
    expect(first).toBeInstanceOf(Date);
    await new Promise((r) => setTimeout(r, 20));
    await svc.updateInvoiceStatus(s.actor, inv.id, 'PAID');
    expect((await issuedAt(inv.id))?.toISOString()).toBe(first!.toISOString());
    await svc.updateInvoiceStatus(s.actor, inv.id, 'DRAFT');
    expect((await issuedAt(inv.id))?.toISOString()).toBe(first!.toISOString());
    await svc.updateInvoiceStatus(s.actor, inv.id, 'PENDING');
    expect((await issuedAt(inv.id))?.toISOString()).toBe(first!.toISOString());
  });

  it('AC-23: updateInvoice with a status change out of DRAFT sets issuedAt once', async () => {
    const s = await seed();
    const inv = await seedDraft(s);
    const save = async (status: string) =>
      svc.updateInvoice(
        s.actor,
        inv.id,
        await withLoadedVersion(prisma, inv.id, form(s, { invoiceNumber: '1-INV-1', status }))
      );
    expect((await save('DRAFT')).success).toBe(true);
    expect(await issuedAt(inv.id)).toBeNull();
    expect((await save('PENDING')).success).toBe(true);
    const first = await issuedAt(inv.id);
    expect(first).toBeInstanceOf(Date);
    await new Promise((r) => setTimeout(r, 20));
    await save('DRAFT');
    expect((await issuedAt(inv.id))?.toISOString()).toBe(first!.toISOString());
    await save('PENDING');
    expect((await issuedAt(inv.id))?.toISOString()).toBe(first!.toISOString());
  });

  it('AC-23: existing invoices are not backfilled', async () => {
    const s = await seed();
    const inv = await seedInvoice(prisma, {
      senderProfile: s.senderProfile,
      customer: s.customer,
      bankAccount: s.bankAccount,
      items: [{ name: 'Widget', unit: 'pcs', quantity: 1, rate: 100, amount: 100 }],
      overrides: { invoiceNumber: '1-INV-2', status: 'PENDING' },
    });
    expect(await issuedAt(inv.id)).toBeNull();
  });
});
