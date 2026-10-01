// T14 (spec.md §5 AC-15, AC-16, AC-19; public-api.md §2.6 createInvoice) — request-free
// createInvoice against a real throwaway Postgres: numbering under the row lock, typed duplicate,
// foreign references answered NOT_FOUND with nothing stored. No session, no next/*.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
import { actingFreelancerForTest } from '../../../support/acting-freelancer';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

const captureMessageMock = vi.fn();
vi.mock('@sentry/nextjs', () => ({ captureMessage: (...a: unknown[]) => captureMessageMock(...a) }));

type Result = {
  success: boolean;
  code?: string;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  data?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
};
type Svc = { createInvoice: (a: unknown, input: unknown) => Promise<Result> };

const DUPLICATE_MESSAGE = 'This invoice number is already used in this sender profile.';

describe.runIf(containerRuntimeAvailable)('createInvoice service (T14, AC-15, AC-16, AC-19)', () => {
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

  async function seedFor(email: string) {
    const user = await createFreelancer(prisma, { email });
    const senderProfile = await createSenderProfile(prisma, user.id, { invoiceCounter: 4 });
    const bankAccount = await createBankAccount(prisma, senderProfile.id);
    const customer = await createCustomer(prisma, user.id, { name: '1 cust' });
    const product = await createProduct(prisma, user.id, { name: '1 prod', price: 100 });
    return { user, senderProfile, bankAccount, customer, product };
  }
  type Seed = Awaited<ReturnType<typeof seedFor>>;

  function form(s: Seed, overrides: Record<string, unknown> = {}) {
    return {
      invoiceNumber: '',
      status: 'DRAFT',
      senderProfileId: s.senderProfile.id,
      bankAccountId: s.bankAccount.id,
      customerId: s.customer.id,
      issueDate: new Date(),
      dueDate: new Date(Date.now() + 14 * 86_400_000),
      currency: 'USD',
      poNumber: '',
      paymentTerms: '',
      taxRate: 0,
      discount: 0,
      shipping: 0,
      notes: '',
      terms: '',
      items: [
        { id: 'item-0', productName: 'Widget', unit: 'pcs', quantity: 1, price: 100, total: 100 },
      ],
      ...overrides,
    };
  }

  const counter = async (id: string) =>
    (await prisma.senderProfile.findUniqueOrThrow({ where: { id } })).invoiceCounter;

  it('AC-15: empty number takes the next sequence number and advances the counter', async () => {
    const a = await seedFor('t14-a@example.com');
    const actor = await actingFreelancerForTest(a.user.id);
    const expected = numbering.formatInvoiceNumber(a.senderProfile.invoicePrefix, 5);
    const res = await svc.createInvoice(actor, form(a));
    expect(res.success).toBe(true);
    expect(res.data.invoiceNumber).toBe(expected);
    expect(await counter(a.senderProfile.id)).toBe(5);
    const stored = await prisma.invoice.findUniqueOrThrow({ where: { id: res.data.id } });
    expect(stored.invoiceNumber).toBe(expected);
  });

  it('a typed free number is kept and the counter is untouched', async () => {
    const a = await seedFor('t14-a@example.com');
    const actor = await actingFreelancerForTest(a.user.id);
    const res = await svc.createInvoice(actor, form(a, { invoiceNumber: 'CUSTOM-1' }));
    expect(res.success).toBe(true);
    expect(res.data.invoiceNumber).toBe('CUSTOM-1');
    expect(await counter(a.senderProfile.id)).toBe(4);
  });

  it('AC-16: a typed taken number (even differing in case/spaces) is CONFLICT with the sender-profile message', async () => {
    const a = await seedFor('t14-a@example.com');
    const actor = await actingFreelancerForTest(a.user.id);
    expect((await svc.createInvoice(actor, form(a, { invoiceNumber: 'CUSTOM-1' }))).success).toBe(true);
    const dup = await svc.createInvoice(actor, form(a, { invoiceNumber: ' custom-1 ' }));
    expect(dup).toMatchObject({
      success: false,
      code: 'CONFLICT',
      fieldErrors: { invoiceNumber: [DUPLICATE_MESSAGE] },
    });
    expect(await prisma.invoice.count()).toBe(1);
    expect(await counter(a.senderProfile.id)).toBe(4);
  });

  it('AC-16: concurrent saves for one sender profile never share a number', async () => {
    const a = await seedFor('t14-a@example.com');
    const actor = await actingFreelancerForTest(a.user.id);
    const results = await Promise.all(
      Array.from({ length: 6 }, () => svc.createInvoice(actor, form(a)))
    );
    expect(results.every((r) => r.success)).toBe(true);
    const numbers = results.map((r) => r.data.invoiceNumber);
    expect(new Set(numbers).size).toBe(6);
    expect(await counter(a.senderProfile.id)).toBe(10);
    expect(captureMessageMock).not.toHaveBeenCalled();
  });

  it('status PAID sets paidAt', async () => {
    const a = await seedFor('t14-a@example.com');
    const actor = await actingFreelancerForTest(a.user.id);
    const res = await svc.createInvoice(actor, form(a, { status: 'PAID' }));
    expect(res.success).toBe(true);
    expect(res.data.status).toBe('PAID');
    expect(typeof res.data.paidAt).toBe('string');
  });

  it('invalid input is VALIDATION and nothing is stored', async () => {
    const a = await seedFor('t14-a@example.com');
    const actor = await actingFreelancerForTest(a.user.id);
    const res = await svc.createInvoice(
      actor,
      form(a, {
        items: [{ id: 'i', productName: 'W', unit: 'pcs', quantity: 0, price: 1, total: 0 }],
      })
    );
    expect(res).toMatchObject({ success: false, code: 'VALIDATION' });
    expect(await prisma.invoice.count()).toBe(0);
  });

  describe('AC-19: a foreign reference is NOT_FOUND, nothing stored, counter untouched', () => {
    const cases: Array<[string, (b: Seed) => Record<string, unknown>]> = [
      ['sender profile', (b) => ({ senderProfileId: b.senderProfile.id, bankAccountId: b.bankAccount.id })],
      ['customer', (b) => ({ customerId: b.customer.id })],
      ['bank account', (b) => ({ bankAccountId: b.bankAccount.id })],
      [
        'product',
        (b) => ({
          items: [
            {
              id: 'item-0',
              productId: b.product.id,
              productName: 'Widget',
              unit: 'pcs',
              quantity: 1,
              price: 100,
              total: 100,
            },
          ],
        }),
      ],
    ];
    for (const [label, pick] of cases) {
      it(`foreign ${label}`, async () => {
        const a = await seedFor('t14-a@example.com');
        const b = await seedFor('t14-b@example.com');
        const actor = await actingFreelancerForTest(a.user.id);
        const bProfileBefore = await prisma.senderProfile.findUniqueOrThrow({ where: { id: b.senderProfile.id } });
        const bCustomerBefore = await prisma.customer.findUniqueOrThrow({ where: { id: b.customer.id } });
        const res = await svc.createInvoice(actor, form(a, pick(b)));
        expect(res).toMatchObject({ success: false, code: 'NOT_FOUND' });
        expect(await prisma.invoice.count()).toBe(0);
        expect(await counter(a.senderProfile.id)).toBe(4);
        expect(await prisma.senderProfile.findUniqueOrThrow({ where: { id: b.senderProfile.id } })).toEqual(bProfileBefore);
        expect(await prisma.customer.findUniqueOrThrow({ where: { id: b.customer.id } })).toEqual(bCustomerBefore);
      });
    }
  });

  it('helpers module lives in lib/services/invoices', async () => {
    const moved = (await import('@/lib/services/invoices/helpers')) as Record<string, unknown>;
    expect(typeof moved.verifyInvoiceRelations).toBe('function');
  });
});

describe.runIf(!containerRuntimeAvailable)('createInvoice service (T14)', () => {
  it.skip('requires a container runtime (Docker) for the throwaway Postgres', () => {});
});
