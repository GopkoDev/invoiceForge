// T7 (spec.md §5 AC-08; §6 Tenant isolation) — foreign-record test for every id-taking product
// function: B's id answers exactly like an id that never existed, and B's row stays unchanged.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../../support/db/container';
import { createTestPrismaClient } from '../../../support/db/client';
import { truncateAllTables } from '../../../support/db/truncate';
import { actingFreelancerForTest } from '../../../support/acting-freelancer';
import { createFreelancer } from '../../../support/factories/user';
import { createProduct as seedProduct } from '../../../support/factories/product';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

type Actor = Awaited<ReturnType<typeof actingFreelancerForTest>>;
type Result = { success: boolean; code?: string; error?: string };
type Service = {
  getProduct: (a: Actor, id: string) => Promise<Result>;
  updateProduct: (a: Actor, id: string, input: unknown) => Promise<Result>;
  deleteProduct: (a: Actor, id: string) => Promise<Result>;
  toggleProductActive: (a: Actor, id: string) => Promise<Result>;
};

const input = {
  name: 'Hijacked',
  description: '',
  unit: 'kg',
  price: '1',
  currency: 'USD',
  isActive: false,
};

describe.runIf(containerRuntimeAvailable)('products foreign-record (T7, AC-08)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;
  let svc: Service;

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    prisma = createTestPrismaClient(db.connectionString);
    svc = (await import('@/lib/services/products/products')) as unknown as Service;
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  afterEach(async () => {
    await truncateAllTables(prisma);
  });

  async function setup() {
    const a = await createFreelancer(prisma);
    const b = await createFreelancer(prisma);
    const bProduct = await seedProduct(prisma, b.id, { name: 'B product', isActive: true });
    return { actor: await actingFreelancerForTest(a.id), bProduct };
  }

  const notFound = { success: false, code: 'NOT_FOUND', error: 'Product not found.' };

  async function unchanged(id: string, before: unknown) {
    expect(await prisma.product.findUnique({ where: { id } })).toEqual(before);
  }

  it('getProduct with B id is NOT_FOUND, same as a never-existing id', async () => {
    const { actor, bProduct } = await setup();
    expect(await svc.getProduct(actor, bProduct.id)).toMatchObject(notFound);
    expect(await svc.getProduct(actor, 'never-existed')).toMatchObject(notFound);
  });

  it('updateProduct with B id is NOT_FOUND and B row is unchanged', async () => {
    const { actor, bProduct } = await setup();
    expect(await svc.updateProduct(actor, bProduct.id, input)).toMatchObject(notFound);
    await unchanged(bProduct.id, bProduct);
  });

  it('deleteProduct with B id is NOT_FOUND and B row is unchanged', async () => {
    const { actor, bProduct } = await setup();
    expect(await svc.deleteProduct(actor, bProduct.id)).toMatchObject(notFound);
    await unchanged(bProduct.id, bProduct);
  });

  it('toggleProductActive with B id is NOT_FOUND and B row is unchanged', async () => {
    const { actor, bProduct } = await setup();
    expect(await svc.toggleProductActive(actor, bProduct.id)).toMatchObject(notFound);
    await unchanged(bProduct.id, bProduct);
  });
});
