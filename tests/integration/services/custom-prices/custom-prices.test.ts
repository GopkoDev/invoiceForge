// T8 (spec.md §5 AC-11 envelope for both custom-price lists; public-api.md §2.3) — request-free
// service tests against a real throwaway Postgres. No session, no next/cache.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../../support/db/container';
import { createTestPrismaClient } from '../../../support/db/client';
import { truncateAllTables } from '../../../support/db/truncate';
import { createFreelancer } from '../../../support/factories/user';
import { createCustomer } from '../../../support/factories/customer';
import { createProduct } from '../../../support/factories/product';
import { createCustomPrice as seedCustomPrice } from '../../../support/factories/custom-price';
import { actingFreelancerForTest } from '../../../support/acting-freelancer';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

type Result<T> =
  | { success: true; data: T }
  | { success: false; code: string; error: string; fieldErrors?: Record<string, string[]> };

type Envelope = { total: number; page: number; totalPages: number; hasMore: boolean };

type Svc = {
  listCustomerCustomPrices: (
    a: unknown,
    id: string,
    q?: object
  ) => Promise<Result<Envelope & { items: Array<{ id: string; product: { name: string } }> }>>;
  listProductCustomPrices: (
    a: unknown,
    id: string,
    q?: object
  ) => Promise<Result<Envelope & { items: Array<{ id: string; customer: { name: string } }> }>>;
  createCustomPrice: (a: unknown, input: object) => Promise<Result<{ id: string }>>;
  updateCustomPrice: (
    a: unknown,
    id: string,
    input: object
  ) => Promise<Result<{ customerId: string; productId: string }>>;
  deleteCustomPrice: (
    a: unknown,
    id: string,
    customerId: string
  ) => Promise<Result<{ customerId: string; productId: string }>>;
};

describe.runIf(containerRuntimeAvailable)('custom-prices service (T8, AC-08, AC-11)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;
  let svc: Svc;

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    prisma = createTestPrismaClient(db.connectionString);
    svc = (await import('@/lib/services/custom-prices/custom-prices')) as unknown as Svc;
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  afterEach(async () => {
    await truncateAllTables(prisma);
  });

  async function seed() {
    const user = await createFreelancer(prisma, { email: 't8-a@example.com' });
    const actor = await actingFreelancerForTest(user.id);
    const customer = await createCustomer(prisma, user.id, { name: 'Plain' });
    return { user, actor, customer };
  }

  it('AC-11: customer list searches product name in any case, 2 per page of 5 matches', async () => {
    const { user, actor, customer } = await seed();
    for (const n of ['1 acme', '2 ACME', '3 Acme', '4 aCMe', '5 ACME', 'Nope']) {
      const p = await createProduct(prisma, user.id, { name: n });
      await seedCustomPrice(prisma, p.id, customer.id);
    }
    const page = await svc.listCustomerCustomPrices(actor, customer.id, {
      search: 'ACME',
      page: 1,
      pageSize: 2,
    });
    expect(page.success).toBe(true);
    if (!page.success) return;
    expect(page.data.items.map((i) => i.product.name)).toEqual(['1 acme', '2 ACME']);
    expect(page.data).toMatchObject({ total: 5, page: 1, totalPages: 3, hasMore: true });
  });

  it('customer list without a query returns the full list ordered by product name then id', async () => {
    const { user, actor, customer } = await seed();
    const pb = await createProduct(prisma, user.id, { name: 'B' });
    const pa = await createProduct(prisma, user.id, { name: 'A' });
    await seedCustomPrice(prisma, pb.id, customer.id);
    const a1 = await seedCustomPrice(prisma, pa.id, customer.id);
    const a2 = await seedCustomPrice(prisma, pa.id, customer.id); // duplicates allowed
    const r = await svc.listCustomerCustomPrices(actor, customer.id);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.total).toBe(3);
    expect(r.data.items.map((i) => i.product.name)).toEqual(['A', 'A', 'B']);
    expect(r.data.items.slice(0, 2).map((i) => i.id)).toEqual([a1.id, a2.id].sort());
  });

  it('product list searches customer name in any case with the page envelope', async () => {
    const { user, actor } = await seed();
    const product = await createProduct(prisma, user.id, { name: 'P' });
    for (const n of ['1 Acme', '2 acme', '3 ACME', 'Zzz']) {
      const c = await createCustomer(prisma, user.id, { name: n });
      await seedCustomPrice(prisma, product.id, c.id);
    }
    const r = await svc.listProductCustomPrices(actor, product.id, {
      search: 'acme',
      page: 2,
      pageSize: 2,
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.items.map((i) => i.customer.name)).toEqual(['3 ACME']);
    expect(r.data).toMatchObject({ total: 3, page: 2, totalPages: 2, hasMore: false });
  });

  it('an invalid list query is VALIDATION', async () => {
    const { actor, customer } = await seed();
    const r = await svc.listCustomerCustomPrices(actor, customer.id, { page: 0 });
    expect(r).toMatchObject({ success: false, code: 'VALIDATION' });
  });

  it('create stores a price; update returns the links; delete removes it', async () => {
    const { user, actor, customer } = await seed();
    const product = await createProduct(prisma, user.id, { price: 100 });
    const created = await svc.createCustomPrice(actor, {
      customerId: customer.id,
      productId: product.id,
      price: 80,
    });
    expect(created.success).toBe(true);
    if (!created.success) return;

    const bad = await svc.updateCustomPrice(actor, created.data.id, { price: -1 });
    expect(bad).toMatchObject({ success: false, code: 'VALIDATION' });

    const upd = await svc.updateCustomPrice(actor, created.data.id, { price: 70 });
    expect(upd).toEqual({
      success: true,
      data: { customerId: customer.id, productId: product.id },
    });
    const row = await prisma.customPrice.findUniqueOrThrow({ where: { id: created.data.id } });
    expect(Number(row.price)).toBe(70);

    const other = await createCustomer(prisma, user.id, { name: 'Other' });
    const miss = await svc.deleteCustomPrice(actor, created.data.id, other.id);
    expect(miss).toMatchObject({
      success: false,
      code: 'NOT_FOUND',
      error: 'Custom price not found.',
    });

    const del = await svc.deleteCustomPrice(actor, created.data.id, customer.id);
    expect(del).toEqual({
      success: true,
      data: { customerId: customer.id, productId: product.id },
    });
    expect(await prisma.customPrice.count()).toBe(0);
  });
});
