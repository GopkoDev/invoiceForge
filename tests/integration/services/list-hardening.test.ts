// T21 (review-2026-10-01 S-07, S-10; spec.md §5 AC-11, AC-25) — literal search wildcards and a
// stable order for equal-named records, against a real throwaway Postgres.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../support/db/container';
import { createTestPrismaClient } from '../../support/db/client';
import { truncateAllTables } from '../../support/db/truncate';
import { createFreelancer } from '../../support/factories/user';
import { createCustomer } from '../../support/factories/customer';
import { createProduct } from '../../support/factories/product';
import { createSenderProfile } from '../../support/factories/sender-profile';
import { createCustomPrice } from '../../support/factories/custom-price';
import { actingFreelancerForTest } from '../../support/acting-freelancer';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

/* eslint-disable @typescript-eslint/no-explicit-any */
describe.runIf(containerRuntimeAvailable)('list hardening (T21)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;
  let customers: any;
  let customPrices: any;
  let editor: any;

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    prisma = createTestPrismaClient(db.connectionString);
    customers = await import('@/lib/services/customers/customers');
    customPrices = await import('@/lib/services/custom-prices/custom-prices');
    editor = await import('@/lib/services/invoices/editor-data');
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  afterEach(async () => {
    await truncateAllTables(prisma);
  });

  it.each(['%', '_'])('AC-11: searching %s on customers matches only literal text', async (term) => {
    const user = await createFreelancer(prisma, { email: 't21-a@example.com' });
    await createCustomer(prisma, user.id, { name: 'Plain Co', companyName: 'Plain' });
    const lit = await createCustomer(prisma, user.id, { name: `100${term} Co`, companyName: 'Lit' });
    const actor = await actingFreelancerForTest(user.id);
    const res = await customers.listCustomers(actor, { search: term });
    expect(res.success).toBe(true);
    expect(res.data.items.map((c: { id: string }) => c.id)).toEqual([lit.id]);
  });

  it.each(['%', '_'])('AC-11: searching %s on custom prices matches only literal text', async (term) => {
    const user = await createFreelancer(prisma, { email: 't21-b@example.com' });
    const customer = await createCustomer(prisma, user.id, { name: 'Acme' });
    const plain = await createProduct(prisma, user.id, { name: 'Plain product' });
    const lit = await createProduct(prisma, user.id, { name: `Rate${term}x` });
    await createCustomPrice(prisma, plain.id, customer.id);
    const cp = await createCustomPrice(prisma, lit.id, customer.id);
    const actor = await actingFreelancerForTest(user.id);
    const res = await customPrices.listCustomerCustomPrices(actor, customer.id, { search: term });
    expect(res.success).toBe(true);
    expect(res.data.items.map((i: { id: string }) => i.id)).toEqual([cp.id]);
  });

  it('AC-25: equal-named customers, products, profiles and custom prices come back in id order', async () => {
    const user = await createFreelancer(prisma, { email: 't21-c@example.com' });
    const cust = [];
    // Inserted in reverse id order so insertion order differs from id order.
    for (const id of ['c3', 'c1', 'c2']) cust.push(await createCustomer(prisma, user.id, { id, name: 'Same' }));
    const prods = [];
    for (const id of ['p3', 'p1', 'p2']) prods.push(await createProduct(prisma, user.id, { id, name: 'Same' }));
    for (const id of ['s3', 's1', 's2']) {
      await createSenderProfile(prisma, user.id, { id, name: 'Same', isDefault: false } as never);
    }
    // updatedAt is part of the profile order, so pin it equal to leave only the id to break the tie.
    await prisma.senderProfile.updateMany({ data: { updatedAt: new Date('2026-01-01T00:00:00Z') } });
    for (const [i, p] of prods.entries()) {
      await createCustomPrice(prisma, p.id, cust[0].id, { id: `cp${3 - i}` });
    }
    const actor = await actingFreelancerForTest(user.id);
    const res = await editor.getInvoiceEditorData(actor);
    expect(res.success).toBe(true);
    const idsOf = (rows: { id: string }[]) => rows.map((r) => r.id);
    expect(idsOf(res.data.customers)).toEqual(['c1', 'c2', 'c3']);
    expect(idsOf(res.data.products)).toEqual(['p1', 'p2', 'p3']);
    expect(idsOf(res.data.customPrices)).toEqual(['cp1', 'cp2', 'cp3']);
    expect(idsOf(res.data.senderProfiles)).toEqual(['s1', 's2', 's3']);
  });
});
