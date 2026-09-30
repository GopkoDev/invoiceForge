// T7 (spec.md §5 AC-01, AC-08, AC-11; public-api.md §2.2 Products) — request-free business
// functions in lib/services/products/products.ts, run against a throwaway Postgres container.
// Results are ActionResult from types/result.ts (`success` discriminant).
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

type Result<T> =
  | { success: true; data: T }
  | { success: false; code: string; error: string; fieldErrors?: Record<string, string[]>; details?: unknown };
type Page<T> = { items: T[]; total: number; page: number; pageSize: number; totalPages: number; hasMore: boolean };
type Serialized = { id: string; name: string; price: number; isActive: boolean };
type Actor = Awaited<ReturnType<typeof actingFreelancerForTest>>;
type Service = {
  listProducts: (a: Actor, q?: Record<string, unknown>) => Promise<Result<Page<Serialized>>>;
  getProduct: (a: Actor, id: string) => Promise<Result<Serialized>>;
  createProduct: (a: Actor, input: unknown) => Promise<Result<{ id: string }>>;
  updateProduct: (a: Actor, id: string, input: unknown) => Promise<Result<void>>;
  deleteProduct: (a: Actor, id: string) => Promise<Result<void>>;
  toggleProductActive: (a: Actor, id: string) => Promise<Result<void>>;
};

const form = (over: Record<string, unknown> = {}) => ({
  name: 'Widget',
  description: '',
  unit: 'pcs',
  price: '12.50',
  currency: 'USD',
  isActive: true,
  ...over,
});

describe.runIf(containerRuntimeAvailable)('products service (T7)', () => {
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

  async function actor() {
    const user = await createFreelancer(prisma);
    return { user, actor: await actingFreelancerForTest(user.id) };
  }

  it('AC-11 shape: case-insensitive name search, page 1 of size 2 over 5 matches of 23', async () => {
    const { user, actor: a } = await actor();
    for (let i = 0; i < 5; i++) await seedProduct(prisma, user.id, { name: `Acme item ${i}` });
    for (let i = 0; i < 18; i++) await seedProduct(prisma, user.id, { name: `Other ${i}` });
    const r = await svc.listProducts(a, { search: 'ACME', page: 1, pageSize: 2 });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.items).toHaveLength(2);
    expect(r.data.items.every((p) => p.name.toLowerCase().includes('acme'))).toBe(true);
    expect(r.data).toMatchObject({ total: 5, page: 1, pageSize: 2, totalPages: 3, hasMore: true });
  });

  it('AC-01: no query returns the full list as page 1 in today order (isActive desc, createdAt desc, id)', async () => {
    const { user, actor: a } = await actor();
    const old = await seedProduct(prisma, user.id, { name: 'old-active' });
    await new Promise((r) => setTimeout(r, 15));
    const inactive = await seedProduct(prisma, user.id, { name: 'inactive', isActive: false });
    await new Promise((r) => setTimeout(r, 15));
    const fresh = await seedProduct(prisma, user.id, { name: 'fresh-active' });
    const r = await svc.listProducts(a);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.items.map((p) => p.id)).toEqual([fresh.id, old.id, inactive.id]);
    expect(r.data).toMatchObject({ total: 3, page: 1, totalPages: 1, hasMore: false });
    expect(typeof r.data.items[0].price).toBe('number');
  });

  it('onlyActive with a search returns only active matches', async () => {
    const { user, actor: a } = await actor();
    await seedProduct(prisma, user.id, { name: 'Acme on', isActive: true });
    await seedProduct(prisma, user.id, { name: 'Acme off', isActive: false });
    await seedProduct(prisma, user.id, { name: 'Zed', isActive: true });
    const r = await svc.listProducts(a, { onlyActive: true, search: 'acme' });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.items.map((p) => p.name)).toEqual(['Acme on']);
    expect(r.data.total).toBe(1);
  });

  it('invalid list query is VALIDATION', async () => {
    const { actor: a } = await actor();
    const r = await svc.listProducts(a, { page: 0 });
    expect(r).toMatchObject({ success: false, code: 'VALIDATION' });
  });

  it('list never includes another freelancer products', async () => {
    const { actor: a } = await actor();
    const b = await createFreelancer(prisma);
    await seedProduct(prisma, b.id, { name: 'B only' });
    const r = await svc.listProducts(a);
    expect(r.success && r.data.total).toBe(0);
  });

  it('createProduct returns the id, getProduct reads it back serialized', async () => {
    const { actor: a } = await actor();
    const c = await svc.createProduct(a, form({ name: 'Gadget', price: '3.25' }));
    expect(c.success).toBe(true);
    if (!c.success) return;
    const g = await svc.getProduct(a, c.data.id);
    expect(g).toMatchObject({ success: true, data: { id: c.data.id, name: 'Gadget', price: 3.25 } });
  });

  it('createProduct with invalid input is VALIDATION with field errors', async () => {
    const { actor: a } = await actor();
    const r = await svc.createProduct(a, form({ name: '' }));
    expect(r).toMatchObject({ success: false, code: 'VALIDATION' });
    if (!r.success) expect(r.fieldErrors?.name).toContain('Name is required');
  });

  it('getProduct of a missing id is NOT_FOUND "Product not found."', async () => {
    const { actor: a } = await actor();
    const r = await svc.getProduct(a, 'does-not-exist');
    expect(r).toMatchObject({ success: false, code: 'NOT_FOUND', error: 'Product not found.' });
  });

  it('updateProduct changes the row', async () => {
    const { user, actor: a } = await actor();
    const p = await seedProduct(prisma, user.id, { name: 'Before' });
    const r = await svc.updateProduct(a, p.id, form({ name: 'After', price: '99' }));
    expect(r.success).toBe(true);
    const row = await prisma.product.findUniqueOrThrow({ where: { id: p.id } });
    expect(row.name).toBe('After');
    expect(Number(row.price)).toBe(99);
  });

  it('toggleProductActive flips isActive', async () => {
    const { user, actor: a } = await actor();
    const p = await seedProduct(prisma, user.id, { isActive: true });
    expect((await svc.toggleProductActive(a, p.id)).success).toBe(true);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).isActive).toBe(false);
    await svc.toggleProductActive(a, p.id);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).isActive).toBe(true);
  });

  it('deleteProduct removes an unused product', async () => {
    const { user, actor: a } = await actor();
    const p = await seedProduct(prisma, user.id);
    expect((await svc.deleteProduct(a, p.id)).success).toBe(true);
    expect(await prisma.product.findUnique({ where: { id: p.id } })).toBeNull();
  });

  it('deleteProduct used in invoices is CONFLICT with today message and no details', async () => {
    const { user, actor: a } = await actor();
    const p = await seedProduct(prisma, user.id);
    const sp = await createSenderProfile(prisma, user.id);
    const ba = await createBankAccount(prisma, sp.id);
    const cu = await createCustomer(prisma, user.id);
    await seedInvoice(prisma, {
      senderProfile: sp,
      customer: cu,
      bankAccount: ba,
      items: [{ productId: p.id, name: 'x', quantity: 1, rate: 100, amount: 100 }],
    });
    const r = await svc.deleteProduct(a, p.id);
    expect(r).toMatchObject({
      success: false,
      code: 'CONFLICT',
      error: 'Cannot delete product used in 1 invoice(s). Consider deactivating it instead.',
    });
    if (!r.success) expect(r.details).toBeUndefined();
    expect(await prisma.product.findUnique({ where: { id: p.id } })).not.toBeNull();
  });
});
