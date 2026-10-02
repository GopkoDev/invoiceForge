// T8 (spec.md §5 AC-08) — Freelancer A acting on Freelancer B's customer, product and custom
// price is answered exactly like an id that never existed, and B's data stays unchanged.
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

type Result = { success: boolean; code?: string; error?: string };
type Svc = {
  listCustomerCustomPrices: (a: unknown, id: string) => Promise<Result>;
  listProductCustomPrices: (a: unknown, id: string) => Promise<Result>;
  createCustomPrice: (a: unknown, input: object) => Promise<Result>;
  updateCustomPrice: (a: unknown, id: string, input: object) => Promise<Result>;
  deleteCustomPrice: (a: unknown, id: string, customerId: string) => Promise<Result>;
};

describe.runIf(containerRuntimeAvailable)(
  'custom-prices service — foreign records (T8, AC-08)',
  () => {
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
      const a = await createFreelancer(prisma, { email: 't8-fa@example.com' });
      const b = await createFreelancer(prisma, { email: 't8-fb@example.com' });
      const actor = await actingFreelancerForTest(a.id);
      const aCustomer = await createCustomer(prisma, a.id, { name: 'A cust' });
      const aProduct = await createProduct(prisma, a.id, { name: 'A prod' });
      const bCustomer = await createCustomer(prisma, b.id, { name: 'B cust' });
      const bProduct = await createProduct(prisma, b.id, { name: 'B prod' });
      const bPrice = await seedCustomPrice(prisma, bProduct.id, bCustomer.id, { price: 55 });
      return { actor, aCustomer, aProduct, bCustomer, bProduct, bPrice };
    }

    it("listCustomerCustomPrices with B's customer is NOT_FOUND like a missing one", async () => {
      const { actor, bCustomer } = await seed();
      const foreign = await svc.listCustomerCustomPrices(actor, bCustomer.id);
      const missing = await svc.listCustomerCustomPrices(actor, 'does-not-exist');
      expect(foreign).toMatchObject({
        success: false,
        code: 'NOT_FOUND',
        error: 'Customer not found.',
      });
      expect(foreign).toEqual(missing);
    });

    it("listProductCustomPrices with B's product is NOT_FOUND like a missing one", async () => {
      const { actor, bProduct } = await seed();
      const foreign = await svc.listProductCustomPrices(actor, bProduct.id);
      const missing = await svc.listProductCustomPrices(actor, 'does-not-exist');
      expect(foreign).toMatchObject({
        success: false,
        code: 'NOT_FOUND',
        error: 'Product not found.',
      });
      expect(foreign).toEqual(missing);
    });

    it("createCustomPrice with B's customer or B's product is NOT_FOUND and stores nothing", async () => {
      const { actor, aCustomer, aProduct, bCustomer, bProduct } = await seed();
      for (const input of [
        { customerId: bCustomer.id, productId: aProduct.id, price: 10 },
        { customerId: aCustomer.id, productId: bProduct.id, price: 10 },
      ]) {
        expect(await svc.createCustomPrice(actor, input)).toMatchObject({
          success: false,
          code: 'NOT_FOUND',
          error: 'Customer or product not found.',
        });
      }
      expect(await prisma.customPrice.count()).toBe(1); // only B's seeded row
    });

    it("updateCustomPrice and deleteCustomPrice with B's price are NOT_FOUND, B's row unchanged", async () => {
      const { actor, bCustomer, bPrice, aCustomer } = await seed();
      const upd = await svc.updateCustomPrice(actor, bPrice.id, { price: 1 });
      expect(upd).toMatchObject({ success: false, code: 'NOT_FOUND' });
      expect(upd).toEqual(await svc.updateCustomPrice(actor, 'does-not-exist', { price: 1 }));

      expect(await svc.deleteCustomPrice(actor, bPrice.id, bCustomer.id)).toMatchObject({
        success: false,
        code: 'NOT_FOUND',
        error: 'Customer not found.',
      });
      expect(await svc.deleteCustomPrice(actor, bPrice.id, aCustomer.id)).toMatchObject({
        success: false,
        code: 'NOT_FOUND',
        error: 'Custom price not found.',
      });

      const row = await prisma.customPrice.findUniqueOrThrow({ where: { id: bPrice.id } });
      expect(Number(row.price)).toBe(55);
    });
  }
);
