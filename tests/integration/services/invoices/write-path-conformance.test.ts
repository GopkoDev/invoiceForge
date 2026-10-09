// invoice-integrity T21 (spec.md §6 NFR "Status lifecycle coverage"; §5 AC-25; sad.md §10 QG-2a, §11 risk
// "future invoice write outside lib/services") — every invoice write path enforces the same rules:
// the 25-pair lifecycle matrix through updateInvoice and updateInvoiceStatus, creation and delete per
// status, a version bump on every successful write (none on a same-status request or a refusal), and a
// session-only caller (no editor) getting exactly the editor's refusals with nothing stored.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Invoice, InvoiceItem, InvoiceStatus, PrismaClient } from '@prisma/client';
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

const authMock = vi.fn<() => Promise<{ user: { id: string } } | null>>();
vi.mock('@/auth', () => ({ auth: () => authMock() }));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, unstable_cache: (fn: () => unknown) => fn }));

const STATUSES: InvoiceStatus[] = ['DRAFT', 'PENDING', 'PAID', 'OVERDUE', 'CANCELLED'];
const ALLOWED = new Set([
  'DRAFT>PENDING',
  'PENDING>PAID',
  'PENDING>OVERDUE',
  'PENDING>CANCELLED',
  'OVERDUE>PENDING',
  'OVERDUE>PAID',
  'OVERDUE>CANCELLED',
  'PAID>PENDING',
]);
const PAIRS = STATUSES.flatMap((from) => STATUSES.map((to) => [from, to] as const));
const FUTURE_DUE = new Date('2999-01-10T00:00:00.000Z');
const PAID_AT = new Date('2026-01-01T10:00:00.000Z');
const iso = (d: Date) => d.toISOString().slice(0, 10);

type Svc = typeof import('@/lib/services/invoices/invoices');
type Actions = typeof import('@/lib/actions/invoice-actions/invoice-actions');

describe.runIf(containerRuntimeAvailable)('invoice write-path conformance (T21)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;
  let svc: Svc;
  let actions: Actions;

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    prisma = createTestPrismaClient(db.connectionString);
    svc = await import('@/lib/services/invoices/invoices');
    actions = await import('@/lib/actions/invoice-actions/invoice-actions');
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  afterEach(async () => {
    await truncateAllTables(prisma);
  });

  async function seed(status: InvoiceStatus, overrides: Record<string, unknown> = {}) {
    const user = await createFreelancer(prisma);
    const actor = await actingFreelancerForTest(user.id, 'UTC');
    authMock.mockResolvedValue({ user: { id: user.id } });
    const senderProfile = await createSenderProfile(prisma, user.id);
    const bankAccount = await createBankAccount(prisma, senderProfile.id);
    const customer = await createCustomer(prisma, user.id);
    const invoice = await createInvoice(prisma, {
      senderProfile,
      customer,
      bankAccount,
      items: [{ name: 'Work', quantity: 1, rate: 100, amount: 100 }],
      overrides: {
        status,
        paidAt: status === 'PAID' ? PAID_AT : null,
        dueDate: FUTURE_DUE,
        version: 5,
        ...overrides,
      } as never,
    });
    return { user, actor, senderProfile, bankAccount, customer, invoice };
  }

  const stored = (id: string) =>
    prisma.invoice.findUniqueOrThrow({ where: { id }, include: { items: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } } });

  function formFrom(inv: Invoice & { items: InvoiceItem[] }, over: Record<string, unknown> = {}) {
    return {
      invoiceNumber: inv.invoiceNumber,
      status: inv.status,
      senderProfileId: inv.senderProfileId,
      bankAccountId: inv.bankAccountId,
      customerId: inv.customerId,
      issueDate: iso(inv.issueDate),
      dueDate: iso(inv.dueDate),
      currency: inv.currency,
      poNumber: inv.poNumber ?? '',
      paymentTerms: inv.paymentTerms ?? '',
      taxRate: Number(inv.taxRate),
      discount: Number(inv.discount),
      shipping: Number(inv.shipping),
      notes: inv.notes ?? '',
      terms: inv.terms ?? '',
      items: inv.items.map((item) => ({
        id: item.id,
        productId: item.productId ?? undefined,
        productName: item.name,
        description: item.description ?? '',
        unit: item.unit,
        quantity: Number(item.quantity),
        price: Number(item.rate),
        total: Number(item.amount),
      })),
      loadedVersion: inv.version,
      ...over,
    };
  }

  describe('updateInvoice — the 25 pairs (the editor path)', () => {
    it.each(PAIRS)('%s → %s', async (from, to) => {
      const s = await seed(from);
      const before = await stored(s.invoice.id);
      const res = await svc.updateInvoice(s.actor, s.invoice.id, formFrom(before, { status: to }));
      const after = await stored(s.invoice.id);

      if (from === 'CANCELLED') {
        // AC-06: a cancelled invoice refuses every edit, a same-status save included.
        expect(res).toMatchObject({ success: false, code: 'VALIDATION', details: { currentStatus: 'CANCELLED' } });
        expect(after).toEqual(before);
      } else if (from === to || ALLOWED.has(`${from}>${to}`)) {
        expect(res.success).toBe(true);
        expect(after.status).toBe(to);
        expect(after.version).toBe(before.version + 1);
        if (from === to) expect(after.paidAt).toEqual(before.paidAt);
        else expect(after.paidAt === null).toBe(to !== 'PAID');
      } else {
        expect(res).toMatchObject({ success: false, code: 'VALIDATION', details: { kind: 'STATUS_NOT_ALLOWED' } });
        expect(after).toEqual(before);
      }
    });
  });

  describe('updateInvoiceStatus — the 25 pairs (the list path)', () => {
    it.each(PAIRS)('%s → %s', async (from, to) => {
      const s = await seed(from);
      const before = await stored(s.invoice.id);
      const res = await svc.updateInvoiceStatus(s.actor, s.invoice.id, to);
      const after = await stored(s.invoice.id);

      if (from === to) {
        // Not a status change: accepted, nothing written, no version bump.
        expect(res).toEqual({
          success: true,
          data: { status: from, paidAt: before.paidAt ? before.paidAt.toISOString() : null },
        });
        expect(after).toEqual(before);
      } else if (ALLOWED.has(`${from}>${to}`)) {
        expect(res).toMatchObject({ success: true, data: { status: to } });
        expect(after.version).toBe(before.version + 1);
        expect(after.paidAt === null).toBe(to !== 'PAID');
      } else {
        expect(res).toMatchObject({
          success: false,
          code: 'VALIDATION',
          details: { kind: 'STATUS_NOT_ALLOWED', currentStatus: from },
        });
        expect(after).toEqual(before);
      }
    });
  });

  it('a hand-marked OVERDUE past its due date is refused back to pending on both paths', async () => {
    const s = await seed('OVERDUE', { dueDate: new Date('2020-01-10T00:00:00.000Z') });
    const before = await stored(s.invoice.id);
    const pastDue = "This invoice is past its due date, so it can't move back to pending. Move its due date first, or mark it paid.";
    expect(await svc.updateInvoiceStatus(s.actor, s.invoice.id, 'PENDING')).toMatchObject({ error: pastDue });
    expect(await svc.updateInvoice(s.actor, s.invoice.id, formFrom(before, { status: 'PENDING' }))).toMatchObject({
      error: pastDue,
    });
    expect(await stored(s.invoice.id)).toEqual(before);
  });

  it.each(['PENDING', 'PAID', 'OVERDUE', 'CANCELLED'] as const)('createInvoice refuses status %s (AC-04b)', async (status) => {
    const s = await seed('DRAFT');
    const before = await prisma.invoice.count();
    const res = await svc.createInvoice(s.actor, { ...formFrom(await stored(s.invoice.id)), invoiceNumber: '', status });
    expect(res).toMatchObject({ success: false, code: 'VALIDATION', details: { kind: 'STATUS_NOT_ALLOWED' } });
    expect(await prisma.invoice.count()).toBe(before);
  });

  it.each(STATUSES)('deleteInvoice of a %s invoice', async (status) => {
    const s = await seed(status);
    const res = await svc.deleteInvoice(s.actor, s.invoice.id);
    if (status === 'DRAFT') {
      expect(res.success).toBe(true);
      expect(await prisma.invoice.count()).toBe(0);
    } else {
      expect(res).toMatchObject({ code: 'VALIDATION', details: { kind: 'STATUS_NOT_ALLOWED', currentStatus: status } });
      expect(await prisma.invoice.count()).toBe(1);
    }
  });

  it('every successful service write sets version: create 0, update +1, status change +1, duplicate 0', async () => {
    const s = await seed('DRAFT', { version: 0 });
    const created = await svc.createInvoice(s.actor, { ...formFrom(await stored(s.invoice.id)), invoiceNumber: '' });
    expect(created.success && (await stored(created.data.id)).version).toBe(0);

    const v0 = await stored(s.invoice.id);
    expect((await svc.updateInvoice(s.actor, s.invoice.id, formFrom(v0, { notes: 'x' }))).success).toBe(true);
    expect((await stored(s.invoice.id)).version).toBe(v0.version + 1);

    expect((await svc.updateInvoiceStatus(s.actor, s.invoice.id, 'PENDING')).success).toBe(true);
    expect((await stored(s.invoice.id)).version).toBe(v0.version + 2);

    const dup = await svc.duplicateInvoice(s.actor, s.invoice.id);
    expect(dup.success && (await stored(dup.data.id)).version).toBe(0);
  });

  it('the lazy calendar-day normalisation is the one write that does not bump version (ADR-0004)', async () => {
    const s = await seed('PENDING', {
      issueDate: new Date('2026-09-30T21:00:00.000Z'),
      dueDate: new Date('2026-10-14T21:00:00.000Z'),
    });
    const profile = await import('@/lib/services/profile/profile');
    expect(await profile.seedTimeZoneIfEmpty(s.user.id, 'Europe/Kyiv')).toBe(true);
    const after = await stored(s.invoice.id);
    expect(after.dueDate.toISOString()).toBe('2026-10-15T00:00:00.000Z');
    expect(after.version).toBe(5);
  });

  describe('AC-25: a session-only caller (no editor) gets the editor refusals, nothing stored', () => {
    it('a forbidden status change', async () => {
      const s = await seed('PAID');
      const before = await stored(s.invoice.id);
      const viaService = await svc.updateInvoiceStatus(s.actor, s.invoice.id, 'DRAFT');
      const viaAction = await actions.updateInvoiceStatus(s.invoice.id, 'DRAFT');
      expect(viaAction).toEqual(viaService);
      expect(viaAction).toMatchObject({ code: 'VALIDATION', details: { suggestion: 'CANCEL_AND_DUPLICATE' } });
      expect(await stored(s.invoice.id)).toEqual(before);
    });

    it('an issued-invoice edit beyond the four editable fields', async () => {
      const s = await seed('PENDING');
      const before = await stored(s.invoice.id);
      const form = formFrom(before, { shipping: 25, notes: 'script' });
      const viaService = await svc.updateInvoice(s.actor, s.invoice.id, form);
      const viaAction = await actions.updateInvoice(s.invoice.id, form);
      expect(viaAction).toEqual(viaService);
      expect(viaAction).toMatchObject({ code: 'VALIDATION', details: { kind: 'ISSUED_INVOICE_LOCKED' } });
      expect(await stored(s.invoice.id)).toEqual(before);
    });

    it('a draft with mismatching currencies, saved or issued', async () => {
      const s = await seed('DRAFT', { currency: 'EUR' });
      const before = await stored(s.invoice.id);
      const viaService = await svc.updateInvoice(s.actor, s.invoice.id, formFrom(before, { notes: 'script' }));
      const viaAction = await actions.updateInvoice(s.invoice.id, formFrom(before, { notes: 'script' }));
      expect(viaAction).toEqual(viaService);
      expect(viaAction).toMatchObject({
        code: 'VALIDATION',
        fieldErrors: { bankAccountId: ['This account is in USD while the invoice is in EUR.'] },
      });
      const issue = await actions.updateInvoiceStatus(s.invoice.id, 'PENDING');
      expect(issue).toMatchObject({ code: 'VALIDATION', fieldErrors: { bankAccountId: [expect.any(String)] } });
      expect(await stored(s.invoice.id)).toEqual(before);
    });
  });
});

describe.runIf(!containerRuntimeAvailable)('invoice write-path conformance (T21)', () => {
  it.skip('skipped: no container runtime', () => {});
});
