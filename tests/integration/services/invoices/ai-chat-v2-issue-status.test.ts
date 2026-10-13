// ai-chat-v2 T16 (spec.md §5 AC-23, AC-25, AC-26, AC-26b; ADR-0007; contracts/server-actions.md §Invoices):
// updateInvoiceStatus gains an optional expectedVersion checked on the locked row before the lifecycle
// decision, and issueInvoiceFromPreview issues through it, setting issuedFromChat in the same write.
// Request-free, against a throwaway Postgres. No session, no next/*.
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
import { createProduct } from '../../../support/factories/product';
import { createInvoice as seedInvoice } from '../../../support/factories/invoice';
import { actingFreelancerForTest } from '../../../support/acting-freelancer';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

type Result = {
  success: boolean;
  code?: string;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  details?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  data?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
};
type Svc = {
  updateInvoiceStatus: (a: unknown, id: string, status: string, opts?: { expectedVersion?: number }) => Promise<Result>;
  issueInvoiceFromPreview: (a: unknown, id: string, expectedVersion: number) => Promise<Result>;
  duplicateInvoice: (a: unknown, id: string) => Promise<Result>;
};

const ALREADY_ISSUED_MESSAGE = 'This invoice has already been issued.';
const OUTDATED_MESSAGE = 'This draft was changed after you opened the preview. Check it and issue again.';

describe.runIf(containerRuntimeAvailable)('issueInvoiceFromPreview and updateInvoiceStatus expectedVersion (ai-chat-v2 T16)', () => {
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
    const customer = await createCustomer(prisma, user.id, { name: 'Acme Corp' });
    return { user, senderProfile, bankAccount, customer };
  }

  async function seedDraft(email: string, overrides: Record<string, unknown> = {}) {
    const s = await seedFor(email);
    const invoice = await seedInvoice(prisma, {
      senderProfile: s.senderProfile,
      customer: s.customer,
      bankAccount: s.bankAccount,
      items: [{ name: 'Design work', unit: 'pcs', quantity: 1, rate: 1000, amount: 1000 }],
      overrides: { invoiceNumber: 'INV-0007', status: 'DRAFT', version: 3, assistantOrigin: 'CHAT', ...overrides } as never,
    });
    return { ...s, invoice };
  }

  const snapshot = (id: string) => prisma.invoice.findUniqueOrThrow({ where: { id }, include: { items: true } });

  it('AC-23: the current draft issues through the editor path: PENDING, number kept, issuedAt once, version +1, issuedFromChat set', async () => {
    const a = await seedDraft('t16-a@example.com');
    const actor = await actingFreelancerForTest(a.user.id);
    const res = await svc.issueInvoiceFromPreview(actor, a.invoice.id, 3);
    expect(res).toEqual({
      success: true,
      data: {
        status: 'PENDING',
        version: 4,
        invoice: expect.objectContaining({ state: 'ISSUED', invoiceId: a.invoice.id, invoiceNumber: 'INV-0007' }),
      },
    });
    const stored = await snapshot(a.invoice.id);
    expect(stored).toMatchObject({ status: 'PENDING', invoiceNumber: 'INV-0007', version: 4, issuedFromChat: true });
    expect(stored.issuedAt).toBeInstanceOf(Date);
  });

  it('AC-26: a draft issued elsewhere is CONFLICT ALREADY_ISSUED with its current state; nothing is written again', async () => {
    const a = await seedDraft('t16-a@example.com');
    const actor = await actingFreelancerForTest(a.user.id);
    // Issued from the editor/list in another tab (no expectedVersion: the row-menu path).
    expect((await svc.updateInvoiceStatus(actor, a.invoice.id, 'PENDING')).success).toBe(true);
    const issued = await snapshot(a.invoice.id);

    const res = await svc.issueInvoiceFromPreview(actor, a.invoice.id, 3);
    expect(res).toEqual({
      success: false,
      code: 'CONFLICT',
      error: ALREADY_ISSUED_MESSAGE,
      details: {
        kind: 'ALREADY_ISSUED',
        invoice: { state: 'ISSUED', invoiceId: a.invoice.id, invoiceNumber: 'INV-0007', status: 'pending' },
      },
    });
    const after = await snapshot(a.invoice.id);
    expect(after).toEqual(issued);
    expect(after.issuedFromChat).toBe(false);
  });

  it('AC-26: ALREADY_ISSUED wins over a version mismatch (not DRAFT is checked first)', async () => {
    const a = await seedDraft('t16-a@example.com', { status: 'PAID', version: 9, paidAt: new Date() });
    const actor = await actingFreelancerForTest(a.user.id);
    const res = await svc.updateInvoiceStatus(actor, a.invoice.id, 'PENDING', { expectedVersion: 3 });
    expect(res).toMatchObject({ success: false, code: 'CONFLICT', details: { kind: 'ALREADY_ISSUED' } });
    expect((await snapshot(a.invoice.id)).status).toBe('PAID');
  });

  it('AC-26b: a line change saved after the preview loaded is CHANGED_ELSEWHERE with the current version; nothing issued', async () => {
    const a = await seedDraft('t16-a@example.com');
    const actor = await actingFreelancerForTest(a.user.id);
    await prisma.invoiceItem.updateMany({ where: { invoiceId: a.invoice.id }, data: { quantity: 2, amount: 2000 } });
    await prisma.invoice.update({ where: { id: a.invoice.id }, data: { version: { increment: 1 }, subtotal: 2000, total: 2000 } });
    const before = await snapshot(a.invoice.id);

    const res = await svc.issueInvoiceFromPreview(actor, a.invoice.id, 3);
    expect(res).toEqual({
      success: false,
      code: 'CONFLICT',
      error: OUTDATED_MESSAGE,
      details: { kind: 'CHANGED_ELSEWHERE', currentVersion: 4 },
    });
    expect(await snapshot(a.invoice.id)).toEqual(before);
  });

  it('AC-26b: a note-only change also makes the preview outdated', async () => {
    const a = await seedDraft('t16-a@example.com');
    const actor = await actingFreelancerForTest(a.user.id);
    await prisma.invoice.update({ where: { id: a.invoice.id }, data: { notes: 'Thanks!', version: { increment: 1 } } });
    const res = await svc.updateInvoiceStatus(actor, a.invoice.id, 'PENDING', { expectedVersion: 3 });
    expect(res).toMatchObject({ success: false, code: 'CONFLICT', details: { kind: 'CHANGED_ELSEWHERE', currentVersion: 4 } });
    const stored = await snapshot(a.invoice.id);
    expect(stored).toMatchObject({ status: 'DRAFT', version: 4, issuedAt: null, issuedFromChat: false });
  });

  it("AC-25: a draft whose lines and bank account are in different currencies is blocked with the editor's message, verbatim; still a draft", async () => {
    const a = await seedDraft('t16-a@example.com', { currency: 'EUR' });
    const actor = await actingFreelancerForTest(a.user.id);
    const before = await snapshot(a.invoice.id);
    const res = await svc.issueInvoiceFromPreview(actor, a.invoice.id, 3);
    expect(res).toEqual({
      success: false,
      code: 'VALIDATION',
      error: 'This account is in USD while the invoice is in EUR.',
      fieldErrors: { bankAccountId: ['This account is in USD while the invoice is in EUR.'] },
    });
    expect(await snapshot(a.invoice.id)).toEqual(before);
  });

  // Every invoice-integrity draft-rule fixture gives the same outcome on the chat path as on the editor/list path.
  const brokenDrafts: Array<{ name: string; overrides: Record<string, unknown>; mutate?: (id: string) => Promise<unknown> }> = [
    { name: 'currency differs from the bank account', overrides: { currency: 'EUR' } },
    {
      name: 'a negative line rate',
      overrides: {},
      mutate: (id) => prisma.invoiceItem.updateMany({ where: { invoiceId: id }, data: { rate: -3 } }),
    },
    {
      name: 'a catalogue line priced in another currency',
      overrides: {},
      mutate: async (id) => {
        const inv = await prisma.invoice.findUniqueOrThrow({ where: { id }, include: { senderProfile: true } });
        const product = await createProduct(prisma, inv.senderProfile.userId, { name: 'Logo pack', currency: 'EUR' });
        await prisma.invoiceItem.updateMany({ where: { invoiceId: id }, data: { productId: product.id } });
      },
    },
    { name: 'a discount above the subtotal', overrides: { discount: 5000 } },
    { name: 'a due date before the issue date', overrides: { dueDate: new Date('2026-01-01T00:00:00Z'), issueDate: new Date('2026-02-01T00:00:00Z') } },
  ];

  for (const fixture of brokenDrafts) {
    it(`AC-25: draft-rule fixture "${fixture.name}" gives the editor's outcome on the chat path`, async () => {
      const a = await seedDraft('t16-a@example.com', fixture.overrides);
      const b = await seedDraft('t16-b@example.com', fixture.overrides);
      await fixture.mutate?.(a.invoice.id);
      await fixture.mutate?.(b.invoice.id);
      const actorA = await actingFreelancerForTest(a.user.id);
      const actorB = await actingFreelancerForTest(b.user.id);

      const viaEditor = await svc.updateInvoiceStatus(actorB, b.invoice.id, 'PENDING');
      const viaChat = await svc.issueInvoiceFromPreview(actorA, a.invoice.id, 3);
      expect(viaEditor).toMatchObject({ success: false, code: 'VALIDATION' });
      expect(viaChat).toEqual(viaEditor);
      expect((await snapshot(a.invoice.id)).status).toBe('DRAFT');
    });
  }

  it('AC-26: two concurrent confirms issue exactly once; the other sees ALREADY_ISSUED', async () => {
    const a = await seedDraft('t16-a@example.com');
    const actor = await actingFreelancerForTest(a.user.id);
    const results = await Promise.all([
      svc.issueInvoiceFromPreview(actor, a.invoice.id, 3),
      svc.issueInvoiceFromPreview(actor, a.invoice.id, 3),
    ]);
    expect(results.filter((r) => r.success)).toHaveLength(1);
    expect(results.filter((r) => !r.success)).toEqual([
      expect.objectContaining({ code: 'CONFLICT', details: expect.objectContaining({ kind: 'ALREADY_ISSUED' }) }),
    ]);
    const stored = await snapshot(a.invoice.id);
    expect(stored).toMatchObject({ status: 'PENDING', version: 4, issuedFromChat: true });
  });

  it('the row-menu caller (no opts) is unchanged: no version check, issuedFromChat stays false', async () => {
    const a = await seedDraft('t16-a@example.com', { version: 11 });
    const actor = await actingFreelancerForTest(a.user.id);
    const res = await svc.updateInvoiceStatus(actor, a.invoice.id, 'PENDING');
    expect(res).toMatchObject({ success: true, data: { status: 'PENDING', paidAt: null } });
    expect(await snapshot(a.invoice.id)).toMatchObject({ status: 'PENDING', version: 12, issuedFromChat: false });
  });

  it('updateInvoiceStatus with expectedVersion alone never sets issuedFromChat', async () => {
    const a = await seedDraft('t16-a@example.com');
    const actor = await actingFreelancerForTest(a.user.id);
    const res = await svc.updateInvoiceStatus(actor, a.invoice.id, 'PENDING', { expectedVersion: 3 });
    expect(res.success).toBe(true);
    expect(await snapshot(a.invoice.id)).toMatchObject({ status: 'PENDING', version: 4, issuedFromChat: false });
  });

  it('a duplicate of an invoice issued from the chat has issuedFromChat = false', async () => {
    const a = await seedDraft('t16-a@example.com');
    const actor = await actingFreelancerForTest(a.user.id);
    expect((await svc.issueInvoiceFromPreview(actor, a.invoice.id, 3)).success).toBe(true);
    const copy = await svc.duplicateInvoice(actor, a.invoice.id);
    expect(copy.success).toBe(true);
    expect((await snapshot(copy.data.id)).issuedFromChat).toBe(false);
    expect((await snapshot(a.invoice.id)).issuedFromChat).toBe(true);
  });

  it("issueInvoiceFromPreview: Freelancer B's invoice is NOT_FOUND, same as a missing or deleted one, and untouched", async () => {
    const a = await seedFor('t16-a@example.com');
    const b = await seedDraft('t16-b@example.com');
    const actor = await actingFreelancerForTest(a.user.id);
    const before = await snapshot(b.invoice.id);
    const foreign = await svc.issueInvoiceFromPreview(actor, b.invoice.id, 3);
    const missing = await svc.issueInvoiceFromPreview(actor, 'never-existed', 3);
    expect(foreign).toMatchObject({ success: false, code: 'NOT_FOUND' });
    expect(foreign).toEqual(missing);
    expect(await snapshot(b.invoice.id)).toEqual(before);
  });
});

describe.runIf(!containerRuntimeAvailable)('issueInvoiceFromPreview (ai-chat-v2 T16)', () => {
  it.skip('requires a container runtime (Docker) for the throwaway Postgres', () => {});
});
