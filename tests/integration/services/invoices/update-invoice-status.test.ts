// T15 (spec.md §5 AC-02, AC-19, AC-23; public-api.md §2.6 updateInvoiceStatus) — request-free
// status change against a real throwaway Postgres: unknown status refused, the paid-date rule,
// and a foreign invoice answered NOT_FOUND with B's row untouched. No session, no next/*.
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

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

type Result = {
  success: boolean;
  code?: string;
  error?: string;
  data?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
};
type Svc = { updateInvoiceStatus: (a: unknown, id: string, status: string) => Promise<Result> };

describe.runIf(containerRuntimeAvailable)('updateInvoiceStatus service (T15, AC-02, AC-19, AC-23)', () => {
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

  async function seedFor(email: string) {
    const user = await createFreelancer(prisma, { email });
    const senderProfile = await createSenderProfile(prisma, user.id, { invoiceCounter: 4 });
    const bankAccount = await createBankAccount(prisma, senderProfile.id);
    const customer = await createCustomer(prisma, user.id, { name: '1 cust' });
    return { user, senderProfile, bankAccount, customer };
  }

  async function seedWithInvoice(email: string, overrides: Record<string, unknown> = {}) {
    const s = await seedFor(email);
    const invoice = await seedInvoice(prisma, {
      senderProfile: s.senderProfile,
      customer: s.customer,
      bankAccount: s.bankAccount,
      items: [{ name: 'Widget', unit: 'pcs', quantity: 1, rate: 100, amount: 100 }],
      overrides: { invoiceNumber: '1-INV-1', ...overrides } as never,
    });
    return { ...s, invoice };
  }
  const snapshot = (id: string) =>
    prisma.invoice.findUniqueOrThrow({ where: { id }, include: { items: true } });

  it("AC-02: an unknown status ('SENT') is VALIDATION 'Unknown status.' and nothing changes", async () => {
    const a = await seedWithInvoice('t15-a@example.com');
    const actor = await actingFreelancerForTest(a.user.id);
    const before = await snapshot(a.invoice.id);
    const res = await svc.updateInvoiceStatus(actor, a.invoice.id, 'SENT');
    expect(res).toMatchObject({ success: false, code: 'VALIDATION', error: 'Unknown status.' });
    expect(await snapshot(a.invoice.id)).toEqual(before);
  });

  it('AC-23: PENDING -> PAID records paidAt', async () => {
    const a = await seedWithInvoice('t15-a@example.com', { status: 'PENDING' });
    const actor = await actingFreelancerForTest(a.user.id);
    const res = await svc.updateInvoiceStatus(actor, a.invoice.id, 'PAID');
    expect(res.success).toBe(true);
    expect(res.data.status).toBe('PAID');
    expect(typeof res.data.paidAt).toBe('string');
    const stored = await snapshot(a.invoice.id);
    expect(stored.status).toBe('PAID');
    expect(stored.paidAt).toBeInstanceOf(Date);
  });

  it('AC-23: PAID -> PAID keeps the original paidAt', async () => {
    const paidAt = new Date('2026-01-15T10:00:00.000Z');
    const a = await seedWithInvoice('t15-a@example.com', { status: 'PAID', paidAt });
    const actor = await actingFreelancerForTest(a.user.id);
    const res = await svc.updateInvoiceStatus(actor, a.invoice.id, 'PAID');
    expect(res).toMatchObject({ success: true, data: { status: 'PAID', paidAt: paidAt.toISOString() } });
    expect((await snapshot(a.invoice.id)).paidAt?.toISOString()).toBe(paidAt.toISOString());
  });

  it('AC-23: PAID -> PENDING clears paidAt', async () => {
    const a = await seedWithInvoice('t15-a@example.com', {
      status: 'PAID',
      paidAt: new Date('2026-01-15T10:00:00.000Z'),
    });
    const actor = await actingFreelancerForTest(a.user.id);
    const res = await svc.updateInvoiceStatus(actor, a.invoice.id, 'PENDING');
    expect(res).toMatchObject({ success: true, data: { status: 'PENDING', paidAt: null } });
    expect((await snapshot(a.invoice.id)).paidAt).toBeNull();
  });

  it('touches only status and paidAt, even on a legacy-total invoice', async () => {
    const a = await seedWithInvoice('t15-a@example.com', { subtotal: 120, total: 120.5 });
    const actor = await actingFreelancerForTest(a.user.id);
    const before = await snapshot(a.invoice.id);
    const res = await svc.updateInvoiceStatus(actor, a.invoice.id, 'PENDING');
    expect(res.success).toBe(true);
    const after = await snapshot(a.invoice.id);
    expect(Number(after.total)).toBe(120.5);
    // invoice-integrity T10: an allowed move also bumps version (ADR-0004).
    const strip = (r: typeof after) => ({ ...r, status: null, paidAt: null, updatedAt: null, version: null });
    expect(after.version).toBe(before.version + 1);
    expect(strip(after)).toEqual(strip(before));
  });

  it('AC-14/AC-25 (T23): issuing a stored draft with a negative rate is refused on the line like the editor, and it stays a draft', async () => {
    const a = await seedWithInvoice('t23-a@example.com', { status: 'DRAFT', discount: 0 });
    await prisma.invoiceItem.updateMany({ where: { invoiceId: a.invoice.id }, data: { rate: -3 } });
    const actor = await actingFreelancerForTest(a.user.id);
    const before = await snapshot(a.invoice.id);
    const res = await svc.updateInvoiceStatus(actor, a.invoice.id, 'PENDING');
    expect(res).toMatchObject({ success: false, code: 'VALIDATION' });
    expect((res as { fieldErrors?: Record<string, string[]> }).fieldErrors).toHaveProperty(['items.0.price']);
    expect(await snapshot(a.invoice.id)).toEqual(before);
    expect(before.status).toBe('DRAFT');
  });

  it("AC-19: B's invoice id is NOT_FOUND (same as a missing id) and B's status/paidAt are unchanged", async () => {
    const a = await seedFor('t15-a@example.com');
    const b = await seedWithInvoice('t15-b@example.com', { status: 'PENDING' });
    const actor = await actingFreelancerForTest(a.user.id);
    const before = await snapshot(b.invoice.id);
    const foreign = await svc.updateInvoiceStatus(actor, b.invoice.id, 'PAID');
    const missing = await svc.updateInvoiceStatus(actor, 'never-existed', 'PAID');
    expect(foreign).toMatchObject({ success: false, code: 'NOT_FOUND' });
    expect(foreign).toEqual(missing);
    expect(await snapshot(b.invoice.id)).toEqual(before);
  });
});

describe.runIf(!containerRuntimeAvailable)('updateInvoiceStatus service (T15)', () => {
  it.skip('requires a container runtime (Docker) for the throwaway Postgres', () => {});
});
