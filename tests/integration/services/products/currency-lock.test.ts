// invoice-integrity T13 (spec.md §5 AC-13b) — the currency of a product used on invoices can't
// change; the count is of distinct invoices (any status, drafts and cancelled included), not lines.
// contracts/server-actions.md §Products (updateProduct).
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../../support/db/container';
import { createTestPrismaClient } from '../../../support/db/client';
import { truncateAllTables } from '../../../support/db/truncate';
import { actingFreelancerForTest } from '../../../support/acting-freelancer';
import { createFreelancer } from '../../../support/factories/user';
import { createProduct as seedProduct } from '../../../support/factories/product';
import { createSenderProfile } from '../../../support/factories/sender-profile';
import { createBankAccount } from '../../../support/factories/bank-account';
import { createCustomer } from '../../../support/factories/customer';
import { createInvoice as seedInvoice } from '../../../support/factories/invoice';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

type Products = typeof import('@/lib/services/products/products');

const form = (over: Record<string, unknown> = {}) => ({
  name: 'Consulting',
  description: '',
  unit: 'hour',
  price: '150.00',
  currency: 'USD' as const,
  isActive: true,
  ...over,
});

describe.runIf(containerRuntimeAvailable)('product currency lock (T13, AC-13b)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;
  let svc: Products;

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    prisma = createTestPrismaClient(db.connectionString);
    svc = await import('@/lib/services/products/products');
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  afterEach(async () => {
    await truncateAllTables(prisma);
  });

  async function seed() {
    const user = await createFreelancer(prisma);
    const actor = await actingFreelancerForTest(user.id);
    const profile = await createSenderProfile(prisma, user.id);
    const account = await createBankAccount(prisma, profile.id);
    const customer = await createCustomer(prisma, user.id);
    const product = await seedProduct(prisma, user.id, { name: 'Consulting', unit: 'hour', currency: 'USD' });
    const line = { productId: product.id, name: 'Consulting', quantity: 1, rate: 150, amount: 150 };
    const base = { senderProfile: profile, customer, bankAccount: account };
    return { actor, product, line, base };
  }

  it('two lines on one invoice + one on a cancelled invoice → N = 2, CONFLICT with fieldErrors.currency', async () => {
    const s = await seed();
    await seedInvoice(prisma, { ...s.base, items: [s.line, s.line], overrides: { invoiceNumber: 'A-1' } });
    await seedInvoice(prisma, {
      ...s.base,
      items: [s.line],
      overrides: { invoiceNumber: 'A-2', status: 'CANCELLED' },
    });

    const result = await svc.updateProduct(s.actor, s.product.id, form({ currency: 'EUR' }));

    expect(result).toEqual({
      success: false,
      code: 'CONFLICT',
      error: "The currency of a product used on 2 invoice(s) can't change.",
      fieldErrors: { currency: ["The currency of a product used on 2 invoice(s) can't change."] },
      details: { kind: 'HAS_INVOICES', invoiceCount: 2 },
    });
    expect((await prisma.product.findUniqueOrThrow({ where: { id: s.product.id } })).currency).toBe('USD');
  });

  it('a product only on a draft is refused with N = 1', async () => {
    const s = await seed();
    await seedInvoice(prisma, { ...s.base, items: [s.line] });
    const result = await svc.updateProduct(s.actor, s.product.id, form({ currency: 'EUR' }));
    expect(result).toMatchObject({ code: 'CONFLICT', details: { kind: 'HAS_INVOICES', invoiceCount: 1 } });
  });

  it('an unchanged currency with a new name saves', async () => {
    const s = await seed();
    await seedInvoice(prisma, { ...s.base, items: [s.line] });
    const result = await svc.updateProduct(s.actor, s.product.id, form({ name: 'Consulting (senior)' }));
    expect(result).toEqual({ success: true, data: undefined });
  });

  it('a product on no line can change its currency', async () => {
    const s = await seed();
    const result = await svc.updateProduct(s.actor, s.product.id, form({ currency: 'EUR' }));
    expect(result.success).toBe(true);
  });
});

describe.runIf(!containerRuntimeAvailable)('product currency lock (T13)', () => {
  it.skip('skipped: no container runtime', () => {});
});
