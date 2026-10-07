// T15 (spec.md §5 AC-02, AC-18, AC-19, AC-23; public-api.md §2.6 updateInvoice) — request-free
// updateInvoice against a real throwaway Postgres: validation, the legacy totals confirmation,
// the paid-date rule and foreign records answered NOT_FOUND with nothing stored. No session, no next/*.
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
import { createInvoice as seedInvoice } from '../../../support/factories/invoice';
import { actingFreelancerForTest } from '../../../support/acting-freelancer';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

type Result = {
  success: boolean;
  code?: string;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  details?: unknown;
  data?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
};
type Svc = { updateInvoice: (a: unknown, id: string, input: unknown) => Promise<Result> };

describe.runIf(containerRuntimeAvailable)('updateInvoice service (T15, AC-02, AC-18, AC-19, AC-23)', () => {
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
    const product = await createProduct(prisma, user.id, { name: '1 prod', price: 100 });
    return { user, senderProfile, bankAccount, customer, product };
  }
  type Seed = Awaited<ReturnType<typeof seedFor>>;

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

  function form(s: Seed, invoiceNumber: string, overrides: Record<string, unknown> = {}) {
    return {
      invoiceNumber,
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
      items: [{ id: 'item-0', productName: 'Widget', unit: 'pcs', quantity: 1, price: 120, total: 120 }],
      ...overrides,
    };
  }

  it('saves a valid change under the owner and returns the saved totals', async () => {
    const a = await seedWithInvoice('t15-a@example.com');
    const actor = await actingFreelancerForTest(a.user.id);
    const res = await svc.updateInvoice(
      actor,
      a.invoice.id,
      form(a, '1-INV-1', {
        items: [{ id: 'i', productName: 'Widget', unit: 'pcs', quantity: 2, price: 100, total: 200 }],
      })
    );
    expect(res.success).toBe(true);
    expect(res.data.total).toBe(200);
    expect(Number((await snapshot(a.invoice.id)).total)).toBe(200);
  });

  it('AC-02: a negative quantity is VALIDATION with the items.0.quantity message and nothing is saved', async () => {
    const a = await seedWithInvoice('t15-a@example.com');
    const actor = await actingFreelancerForTest(a.user.id);
    const before = await snapshot(a.invoice.id);
    const res = await svc.updateInvoice(
      actor,
      a.invoice.id,
      form(a, '1-INV-1', {
        items: [{ id: 'i', productName: 'Widget', unit: 'pcs', quantity: -1, price: 100, total: -100 }],
      })
    );
    expect(res).toMatchObject({
      success: false,
      code: 'VALIDATION',
      fieldErrors: { 'items.0.quantity': ['Quantity must be greater than zero.'] },
    });
    expect(await snapshot(a.invoice.id)).toEqual(before);
  });

  describe('AC-18: legacy totals', () => {
    const legacyOverrides = { subtotal: 120, total: 120.5 };

    it('without confirmedTotals: CONFLICT TOTALS_CHANGED with old and new total, nothing stored', async () => {
      const a = await seedWithInvoice('t15-a@example.com', legacyOverrides);
      const actor = await actingFreelancerForTest(a.user.id);
      const before = await snapshot(a.invoice.id);
      const res = await svc.updateInvoice(actor, a.invoice.id, form(a, '1-INV-1'));
      expect(res).toMatchObject({
        success: false,
        code: 'CONFLICT',
        error: 'The total of this invoice changes from 120.50 to 120.00. Confirm to save.',
        details: { kind: 'TOTALS_CHANGED', oldTotal: '120.50', newTotal: '120.00' },
      });
      expect(await snapshot(a.invoice.id)).toEqual(before);
    });

    it('stale confirmedTotals ask again with the current figures', async () => {
      const a = await seedWithInvoice('t15-a@example.com', legacyOverrides);
      const actor = await actingFreelancerForTest(a.user.id);
      const res = await svc.updateInvoice(
        actor,
        a.invoice.id,
        form(a, '1-INV-1', { confirmedTotals: { oldTotal: '999.00', newTotal: '888.00' } })
      );
      expect(res).toMatchObject({
        success: false,
        code: 'CONFLICT',
        details: { kind: 'TOTALS_CHANGED', oldTotal: '120.50', newTotal: '120.00' },
      });
    });

    it('matching confirmedTotals saves', async () => {
      const a = await seedWithInvoice('t15-a@example.com', legacyOverrides);
      const actor = await actingFreelancerForTest(a.user.id);
      const res = await svc.updateInvoice(
        actor,
        a.invoice.id,
        form(a, '1-INV-1', { confirmedTotals: { oldTotal: '120.50', newTotal: '120.00' } })
      );
      expect(res.success).toBe(true);
      expect(Number((await snapshot(a.invoice.id)).total)).toBe(120);
    });
  });

  it('AC-23: saving an already-paid invoice as paid keeps its paidAt', async () => {
    const paidAt = new Date('2026-01-15T10:00:00.000Z');
    const a = await seedWithInvoice('t15-a@example.com', { status: 'PAID', paidAt });
    const actor = await actingFreelancerForTest(a.user.id);
    const res = await svc.updateInvoice(
      actor,
      a.invoice.id,
      form(a, '1-INV-1', {
        status: 'PAID',
        items: [{ id: 'i', productName: 'Widget', unit: 'pcs', quantity: 1, price: 100, total: 100 }],
      })
    );
    expect(res.success).toBe(true);
    expect((await snapshot(a.invoice.id)).paidAt?.toISOString()).toBe(paidAt.toISOString());
  });

  describe('AC-19: foreign invoice or reference is NOT_FOUND and nothing is stored', () => {
    it("B's invoice id: NOT_FOUND, B's row byte-identical", async () => {
      const a = await seedFor('t15-a@example.com');
      const b = await seedWithInvoice('t15-b@example.com');
      const actor = await actingFreelancerForTest(a.user.id);
      const before = await snapshot(b.invoice.id);
      const res = await svc.updateInvoice(actor, b.invoice.id, form(a, 'HIJACK-1'));
      expect(res).toMatchObject({ success: false, code: 'NOT_FOUND' });
      expect(await snapshot(b.invoice.id)).toEqual(before);
    });

    it("A's invoice moved onto B's sender profile: NOT_FOUND, nothing stored, B's counter unchanged", async () => {
      const a = await seedWithInvoice('t15-a@example.com');
      const b = await seedFor('t15-b@example.com');
      const actor = await actingFreelancerForTest(a.user.id);
      const before = await snapshot(a.invoice.id);
      const counterBefore = (await prisma.senderProfile.findUniqueOrThrow({ where: { id: b.senderProfile.id } })).invoiceCounter;
      const res = await svc.updateInvoice(
        actor,
        a.invoice.id,
        form(a, '1-INV-1', { senderProfileId: b.senderProfile.id, bankAccountId: b.bankAccount.id })
      );
      expect(res).toMatchObject({ success: false, code: 'NOT_FOUND' });
      expect(await snapshot(a.invoice.id)).toEqual(before);
      const counterAfter = (await prisma.senderProfile.findUniqueOrThrow({ where: { id: b.senderProfile.id } })).invoiceCounter;
      expect(counterAfter).toBe(counterBefore);
    });

    const cases: Array<[string, (b: Seed) => Record<string, unknown>]> = [
      ['customer', (b) => ({ customerId: b.customer.id })],
      ['bank account', (b) => ({ bankAccountId: b.bankAccount.id })],
      [
        'product',
        (b) => ({
          items: [
            { id: 'item-0', productId: b.product.id, productName: 'Widget', unit: 'pcs', quantity: 1, price: 100, total: 100 },
          ],
        }),
      ],
    ];
    for (const [label, pick] of cases) {
      it(`A's invoice pointing to B's ${label}`, async () => {
        const a = await seedWithInvoice('t15-a@example.com');
        const b = await seedFor('t15-b@example.com');
        const actor = await actingFreelancerForTest(a.user.id);
        const before = await snapshot(a.invoice.id);
        const res = await svc.updateInvoice(actor, a.invoice.id, form(a, '1-INV-1', pick(b)));
        expect(res).toMatchObject({ success: false, code: 'NOT_FOUND' });
        expect(await snapshot(a.invoice.id)).toEqual(before);
      });
    }
  });
});

describe.runIf(!containerRuntimeAvailable)('updateInvoice service (T15)', () => {
  it.skip('requires a container runtime (Docker) for the throwaway Postgres', () => {});
});
