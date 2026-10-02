// T6 (spec.md §5 AC-01, AC-02, AC-03, AC-11, AC-17; public-api.md §2.1) — request-free business
// functions for customers, called with actingFreelancerForTest (no '@/auth' mock). Real throwaway
// Postgres. AC-03 (revalidation) and AC-01 parity are covered by the unchanged action tests.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../../support/db/container';
import { createTestPrismaClient } from '../../../support/db/client';
import { truncateAllTables } from '../../../support/db/truncate';
import { createFreelancer } from '../../../support/factories/user';
import { createSenderProfile } from '../../../support/factories/sender-profile';
import { createBankAccount } from '../../../support/factories/bank-account';
import { createCustomer as seedCustomer } from '../../../support/factories/customer';
import { createInvoice as seedInvoice } from '../../../support/factories/invoice';
import { actingFreelancerForTest } from '../../../support/acting-freelancer';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

type Result<T> =
  | { success: true; data: T }
  | {
      success: false;
      code: string;
      error: string;
      fieldErrors?: Record<string, string[] | string>;
      details?: { kind: string; invoiceCount?: number };
    };
type Page<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasMore: boolean;
};
type CustomerRow = { id: string; name: string; _count: { invoices: number; customPrices: number } };
type Service = {
  listCustomers: (a: unknown, q?: unknown) => Promise<Result<Page<CustomerRow>>>;
  getCustomer: (a: unknown, id: string) => Promise<Result<CustomerRow>>;
  createCustomer: (a: unknown, input: unknown) => Promise<Result<{ id: string }>>;
  updateCustomer: (a: unknown, id: string, input: unknown) => Promise<Result<void>>;
  deleteCustomer: (a: unknown, id: string) => Promise<Result<void>>;
};

const validInput = {
  name: 'Acme Corp',
  companyName: 'Acme Inc',
  email: 'billing@acme.test',
  defaultCurrency: 'USD',
};

describe.runIf(containerRuntimeAvailable)('customers service (T6)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;
  let svc: Service;

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    prisma = createTestPrismaClient(db.connectionString);
    svc = (await import('@/lib/services/customers/customers')) as unknown as Service;
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await truncateAllTables(prisma);
  });

  async function seedOwner(tag: string) {
    const freelancer = await createFreelancer(prisma, { email: `t6-${tag}@example.com` });
    return { freelancer, actor: await actingFreelancerForTest(freelancer.id) };
  }

  async function seedCustomerAt(userId: string, n: number, overrides: { name: string; email?: string }) {
    return prisma.customer.create({
      data: {
        userId,
        name: overrides.name,
        email: overrides.email ?? `c${n}-${userId}@example.test`,
        defaultCurrency: 'USD',
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, n)),
      },
    });
  }

  it('AC-11: search "ACME" page 1 size 2 returns 2 of 5 matches, total 5, 3 pages, hasMore', async () => {
    const { freelancer, actor } = await seedOwner('ac11');
    // 23 customers: 5 match "acme" (by name below index 10, by email from index 10, mixed case).
    const matching = new Set([2, 5, 9, 14, 20]);
    for (let n = 0; n < 23; n++) {
      const isMatch = matching.has(n);
      await seedCustomerAt(freelancer.id, n, {
        name: isMatch && n < 10 ? `Some acme Ltd ${n}` : `Plain ${n}`,
        email: isMatch && n >= 10 ? `Team@AcMe.test${n}` : undefined,
      });
    }
    // another owner's acme customer must not leak in
    const other = await createFreelancer(prisma, { email: 't6-ac11-other@example.com' });
    await seedCustomerAt(other.id, 30, { name: 'ACME foreign' });

    const result = await svc.listCustomers(actor, { search: 'ACME', page: 1, pageSize: 2 });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.total).toBe(5);
    expect(result.data.page).toBe(1);
    expect(result.data.totalPages).toBe(3);
    expect(result.data.hasMore).toBe(true);
    expect(result.data.items).toHaveLength(2);
    // createdAt desc: the newest matches are n=20 then n=14
    expect(result.data.items.map((c) => c.name)).toEqual(['Plain 20', 'Plain 14']);
    expect(result.data.items[0]._count).toEqual({ invoices: 0, customPrices: 0 });
  });

  it('AC-01: no query returns the full list as page 1 in createdAt desc order', async () => {
    const { freelancer, actor } = await seedOwner('full');
    await seedCustomerAt(freelancer.id, 1, { name: 'first' });
    await seedCustomerAt(freelancer.id, 2, { name: 'second' });
    await seedCustomerAt(freelancer.id, 3, { name: 'third' });

    const result = await svc.listCustomers(actor);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.items.map((c) => c.name)).toEqual(['third', 'second', 'first']);
    expect(result.data.total).toBe(3);
    expect(result.data.page).toBe(1);
    expect(result.data.hasMore).toBe(false);
  });

  it('listCustomers: invalid page and over-long search are VALIDATION, no records', async () => {
    const { freelancer, actor } = await seedOwner('invalid');
    await seedCustomerAt(freelancer.id, 1, { name: 'x' });
    for (const query of [{ page: 0 }, { page: -5 }, { page: 2.5 }, { search: 'a'.repeat(101) }]) {
      const result = await svc.listCustomers(actor, query);
      expect(result.success).toBe(false);
      if (result.success) continue;
      expect(result.code).toBe('VALIDATION');
    }
  });

  it('listCustomers: a page past the last one falls back to page 1', async () => {
    const { freelancer, actor } = await seedOwner('past');
    for (let n = 0; n < 3; n++) await seedCustomerAt(freelancer.id, n, { name: `c${n}` });
    const result = await svc.listCustomers(actor, { page: 9, pageSize: 2 });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.page).toBe(1);
    expect(result.data.items).toHaveLength(2);
  });

  it("getCustomer: returns the owner's customer with counts; unknown id is NOT_FOUND", async () => {
    const { freelancer, actor } = await seedOwner('get');
    const customer = await seedCustomer(prisma, freelancer.id, { name: 'Getme' });

    const found = await svc.getCustomer(actor, customer.id);
    expect(found.success).toBe(true);
    if (found.success) {
      expect(found.data.name).toBe('Getme');
      expect(found.data._count).toEqual({ invoices: 0, customPrices: 0 });
    }

    const missing = await svc.getCustomer(actor, 'does-not-exist');
    expect(missing).toMatchObject({ success: false, code: 'NOT_FOUND', error: 'Customer not found.' });
  });

  it('createCustomer: creates under the actor and returns { id }', async () => {
    const { freelancer, actor } = await seedOwner('create');
    const result = await svc.createCustomer(actor, validInput);
    expect(result.success).toBe(true);
    if (!result.success) return;
    const row = await prisma.customer.findUnique({ where: { id: result.data.id } });
    expect(row?.userId).toBe(freelancer.id);
    expect(row?.name).toBe('Acme Corp');
  });

  it("AC-02: createCustomer with invalid values is VALIDATION with today's field messages", async () => {
    const { actor } = await seedOwner('create-invalid');
    const result = await svc.createCustomer(actor, { ...validInput, name: '', email: 'nope' });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.code).toBe('VALIDATION');
    expect(JSON.stringify(result.fieldErrors)).toContain('Name is required');
    expect(JSON.stringify(result.fieldErrors)).toContain('Invalid email');
    expect(await prisma.customer.count()).toBe(0);
  });

  it("updateCustomer: updates the owner's row; VALIDATION precedes NOT_FOUND", async () => {
    const { freelancer, actor } = await seedOwner('update');
    const customer = await seedCustomer(prisma, freelancer.id, { name: 'Before' });

    const updated = await svc.updateCustomer(actor, customer.id, { ...validInput, name: 'After' });
    expect(updated.success).toBe(true);
    expect((await prisma.customer.findUnique({ where: { id: customer.id } }))?.name).toBe('After');

    const invalid = await svc.updateCustomer(actor, 'does-not-exist', { ...validInput, name: '' });
    expect(invalid).toMatchObject({ success: false, code: 'VALIDATION' });

    const missing = await svc.updateCustomer(actor, 'does-not-exist', validInput);
    expect(missing).toMatchObject({ success: false, code: 'NOT_FOUND', error: 'Customer not found.' });
  });

  it('deleteCustomer: deletes a customer with no invoices', async () => {
    const { freelancer, actor } = await seedOwner('delete');
    const customer = await seedCustomer(prisma, freelancer.id);
    const result = await svc.deleteCustomer(actor, customer.id);
    expect(result.success).toBe(true);
    expect(await prisma.customer.findUnique({ where: { id: customer.id } })).toBeNull();
  });

  async function seedWithInvoices(tag: string, invoices: number) {
    const { freelancer, actor } = await seedOwner(tag);
    const senderProfile = await createSenderProfile(prisma, freelancer.id);
    const bankAccount = await createBankAccount(prisma, senderProfile.id);
    const customer = await seedCustomer(prisma, freelancer.id);
    const make = (i: number) =>
      seedInvoice(prisma, {
        senderProfile,
        customer,
        bankAccount,
        overrides: { invoiceNumber: `${senderProfile.invoicePrefix}-T6-${i}` },
      });
    for (let i = 1; i <= invoices; i++) await make(i);
    return { freelancer, actor, customer, make };
  }

  it('AC-17: deleteCustomer with invoices is CONFLICT HAS_INVOICES with the count, nothing removed', async () => {
    const { actor, customer } = await seedWithInvoices('blocked', 3);
    const result = await svc.deleteCustomer(actor, customer.id);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.code).toBe('CONFLICT');
    expect(result.details).toEqual({ kind: 'HAS_INVOICES', invoiceCount: 3 });
    expect(result.error).toBe("3 invoices depend on this customer, so it can't be deleted.");
    expect(await prisma.customer.findUnique({ where: { id: customer.id } })).not.toBeNull();
    expect(await prisma.invoice.count({ where: { customerId: customer.id } })).toBe(3);
  });

  it('AC-17: an invoice saved between the count and the delete gives the same CONFLICT, recounted, never FAILED', async () => {
    const { actor, customer, make } = await seedWithInvoices('race', 0);
    const { prisma: appPrisma } = (await import('@/prisma')) as unknown as { prisma: PrismaClient };
    type Lookup = (...args: unknown[]) => Promise<unknown>;
    let raced = false;
    const arm = (delegate: Record<string, Lookup>, method: string) => {
      const original = delegate[method].bind(delegate);
      vi.spyOn(delegate, method).mockImplementation(async (...args: unknown[]) => {
        const counted = await original(...args);
        if (!raced) {
          raced = true;
          await make(1);
        }
        return counted;
      });
    };
    // whichever query the service counts with, an invoice is committed right after the first one
    arm(appPrisma.invoice as unknown as Record<string, Lookup>, 'count');
    arm(appPrisma.customer as unknown as Record<string, Lookup>, 'findFirst');
    arm(appPrisma.customer as unknown as Record<string, Lookup>, 'findUnique');

    const result = await svc.deleteCustomer(actor, customer.id);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.code).toBe('CONFLICT');
    expect(result.details).toEqual({ kind: 'HAS_INVOICES', invoiceCount: 1 });
    expect(await prisma.customer.findUnique({ where: { id: customer.id } })).not.toBeNull();
  });
});

describe.runIf(!containerRuntimeAvailable)('customers service (T6)', () => {
  it.skip('skipped: no container runtime', () => {});
});
