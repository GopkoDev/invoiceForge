// T16 (spec.md §5 AC-08, AC-24; public-api.md §2.6 duplicateInvoice, deleteInvoice) — request-free
// duplicate and delete against a real throwaway Postgres: the copy's numbering/dates/lines, the
// legacy-amount refusal, the draft-only delete guard, and foreign invoices answered NOT_FOUND with
// B's rows untouched. No session, no next/*.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

const captureMessageMock = vi.fn();
vi.mock('@sentry/nextjs', () => ({ captureMessage: (...a: unknown[]) => captureMessageMock(...a) }));

type Result = {
  success: boolean;
  code?: string;
  error?: string;
  data?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
};
type Svc = {
  duplicateInvoice: (a: unknown, id: string) => Promise<Result>;
  deleteInvoice: (a: unknown, id: string) => Promise<Result>;
};

const DAY_MS = 24 * 60 * 60 * 1000;

describe.runIf(containerRuntimeAvailable)('duplicate/delete invoice service (T16, AC-08, AC-24)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;
  let svc: Svc;
  let numbering: { formatInvoiceNumber: (prefix: string, n: number) => string };

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    prisma = createTestPrismaClient(db.connectionString);
    svc = (await import('@/lib/services/invoices/invoices')) as unknown as Svc;
    numbering = (await import('@/lib/services/invoices/numbering')) as unknown as typeof numbering;
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  beforeEach(() => captureMessageMock.mockReset());
  afterEach(async () => {
    await truncateAllTables(prisma);
  });

  async function seedWithInvoice(email: string, overrides: Record<string, unknown> = {}, rate = 100) {
    const user = await createFreelancer(prisma, { email });
    const senderProfile = await createSenderProfile(prisma, user.id, { invoiceCounter: 4 });
    const bankAccount = await createBankAccount(prisma, senderProfile.id);
    const customer = await createCustomer(prisma, user.id, { name: '1 cust' });
    const invoice = await seedInvoice(prisma, {
      senderProfile,
      customer,
      bankAccount,
      items: [{ name: 'Widget', unit: 'pcs', quantity: 2, rate, amount: 2 * rate }],
      overrides: { invoiceNumber: '1-INV-1', ...overrides } as never,
    });
    return { user, senderProfile, bankAccount, customer, invoice };
  }
  const snapshot = (id: string) =>
    prisma.invoice.findUniqueOrThrow({ where: { id }, include: { items: true } });
  const counter = async (id: string) =>
    (await prisma.senderProfile.findUniqueOrThrow({ where: { id } })).invoiceCounter;

  it('AC-24: duplicate makes a DRAFT with same customer/profile/lines, next number, dated today, due in 30 days; original unchanged', async () => {
    const a = await seedWithInvoice('t16-a@example.com', { status: 'PENDING' });
    const actor = await actingFreelancerForTest(a.user.id);
    const before = await snapshot(a.invoice.id);
    const t0 = Date.now();
    const res = await svc.duplicateInvoice(actor, a.invoice.id);
    const t1 = Date.now();
    expect(res.success).toBe(true);
    const expectedNumber = numbering.formatInvoiceNumber(a.senderProfile.invoicePrefix, 5);
    expect(res.data).toEqual({ id: expect.any(String), invoiceNumber: expectedNumber });
    expect(res.data.id).not.toBe(a.invoice.id);

    const copy = await snapshot(res.data.id);
    expect(copy.status).toBe('DRAFT');
    expect(copy.customerId).toBe(a.customer.id);
    expect(copy.senderProfileId).toBe(a.senderProfile.id);
    expect(copy.invoiceNumber).toBe(expectedNumber);
    expect(copy.items.map((i) => [i.name, Number(i.quantity), Number(i.rate), Number(i.amount)])).toEqual([
      ['Widget', 2, 100, 200],
    ]);
    expect(copy.issueDate.getTime()).toBeGreaterThanOrEqual(t0 - 1000);
    expect(copy.issueDate.getTime()).toBeLessThanOrEqual(t1 + 1000);
    expect(copy.dueDate.getTime() - copy.issueDate.getTime()).toBe(30 * DAY_MS);
    expect(await counter(a.senderProfile.id)).toBe(5);
    expect(await snapshot(a.invoice.id)).toEqual(before);
  });

  it("AC-24: a legacy rule-breaking source is FAILED \"This invoice can't be duplicated.\", nothing created, no Sentry call", async () => {
    const a = await seedWithInvoice('t16-a@example.com', {}, -5);
    const actor = await actingFreelancerForTest(a.user.id);
    const res = await svc.duplicateInvoice(actor, a.invoice.id);
    expect(res.success).toBe(false);
    expect(res.code).toBe('FAILED');
    expect(res.error).toContain("This invoice can't be duplicated.");
    expect(await prisma.invoice.count()).toBe(1);
    expect(await counter(a.senderProfile.id)).toBe(4);
    expect(captureMessageMock).not.toHaveBeenCalled();
  });

  it('delete of a draft removes it', async () => {
    const a = await seedWithInvoice('t16-a@example.com', { status: 'DRAFT' });
    const actor = await actingFreelancerForTest(a.user.id);
    const res = await svc.deleteInvoice(actor, a.invoice.id);
    expect(res.success).toBe(true);
    expect(await prisma.invoice.count()).toBe(0);
    expect(await prisma.invoiceItem.count()).toBe(0);
  });

  it('delete of a PENDING invoice is CONFLICT and the invoice stays unchanged', async () => {
    const a = await seedWithInvoice('t16-a@example.com', { status: 'PENDING' });
    const actor = await actingFreelancerForTest(a.user.id);
    const before = await snapshot(a.invoice.id);
    const res = await svc.deleteInvoice(actor, a.invoice.id);
    expect(res).toMatchObject({
      success: false,
      code: 'CONFLICT',
      error: 'Only draft invoices can be deleted. Consider cancelling instead.',
    });
    expect(await snapshot(a.invoice.id)).toEqual(before);
  });

  it("AC-08 foreign record: duplicateInvoice with B's invoice id is NOT_FOUND (same as a missing id), nothing created, B unchanged", async () => {
    const a = await seedWithInvoice('t16-a@example.com');
    const b = await seedWithInvoice('t16-b@example.com');
    const actor = await actingFreelancerForTest(a.user.id);
    const before = await snapshot(b.invoice.id);
    const foreign = await svc.duplicateInvoice(actor, b.invoice.id);
    const missing = await svc.duplicateInvoice(actor, 'never-existed');
    expect(foreign).toMatchObject({ success: false, code: 'NOT_FOUND' });
    expect(foreign).toEqual(missing);
    expect(await prisma.invoice.count()).toBe(2);
    expect(await snapshot(b.invoice.id)).toEqual(before);
    expect(await counter(b.senderProfile.id)).toBe(4);
  });

  it("AC-08 foreign record: deleteInvoice with B's draft id is NOT_FOUND (same as a missing id) and B's rows are unchanged", async () => {
    const a = await seedWithInvoice('t16-a@example.com');
    const b = await seedWithInvoice('t16-b@example.com', { status: 'DRAFT' });
    const actor = await actingFreelancerForTest(a.user.id);
    const before = await snapshot(b.invoice.id);
    const foreign = await svc.deleteInvoice(actor, b.invoice.id);
    const missing = await svc.deleteInvoice(actor, 'never-existed');
    expect(foreign).toMatchObject({ success: false, code: 'NOT_FOUND' });
    expect(foreign).toEqual(missing);
    expect(await snapshot(b.invoice.id)).toEqual(before);
  });
});

describe.runIf(!containerRuntimeAvailable)('duplicate/delete invoice service (T16)', () => {
  it.skip('requires a container runtime (Docker) for the throwaway Postgres', () => {});
});
