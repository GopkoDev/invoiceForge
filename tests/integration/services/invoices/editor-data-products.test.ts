// invoice-integrity T16 (spec.md §5 AC-15, AC-01; contracts/server-actions.md §getInvoiceEditorData) — the
// editor data carries the active products plus every product the invoice's lines refer to, active or
// not (each with isActive), the loaded version, and the invoice's issued details.
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
import { createInvoice } from '../../../support/factories/invoice';
import { actingFreelancerForTest } from '../../../support/acting-freelancer';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

describe.runIf(containerRuntimeAvailable)('getInvoiceEditorData — products, version, issued details (T16)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;
  let svc: typeof import('@/lib/services/invoices/editor-data');

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    prisma = createTestPrismaClient(db.connectionString);
    svc = await import('@/lib/services/invoices/editor-data');
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  afterEach(async () => {
    await truncateAllTables(prisma);
  });

  it('includes an inactive product referenced by a line, but not other inactive products', async () => {
    const user = await createFreelancer(prisma);
    const actor = await actingFreelancerForTest(user.id, 'UTC');
    const profile = await createSenderProfile(prisma, user.id);
    const account = await createBankAccount(prisma, profile.id);
    const customer = await createCustomer(prisma, user.id, { name: 'Acme' });
    const active = await createProduct(prisma, user.id, { name: 'Design' });
    const retiredOnLine = await createProduct(prisma, user.id, { name: 'Consulting 2025', isActive: false });
    await createProduct(prisma, user.id, { name: 'Unused retired', isActive: false });
    const invoice = await createInvoice(prisma, {
      senderProfile: profile,
      customer,
      bankAccount: account,
      items: [{ productId: retiredOnLine.id, name: 'Consulting 2025', quantity: 1, rate: 150, amount: 150 }],
      overrides: { status: 'PAID', version: 6, customerName: 'Acme (issued)' },
    });

    const withInvoice = await svc.getInvoiceEditorData(actor, invoice.id);
    if (!withInvoice.success) throw new Error(withInvoice.error);
    expect(withInvoice.data.products.map((p) => [p.name, p.isActive]).sort()).toEqual([
      ['Consulting 2025', false],
      ['Design', true],
    ]);
    expect(withInvoice.data.version).toBe(6);
    expect(withInvoice.data.issuedDetails?.customer.name).toBe('Acme (issued)');
    expect(withInvoice.data.issuedDetails?.bank.accountNumber).toBe(account.accountNumber);

    const newInvoice = await svc.getInvoiceEditorData(actor);
    if (!newInvoice.success) throw new Error(newInvoice.error);
    expect(newInvoice.data.products.map((p) => p.id)).toEqual([active.id]);
    expect(newInvoice.data.issuedDetails).toBeNull();
  });
});

describe.runIf(!containerRuntimeAvailable)('getInvoiceEditorData — products (T16)', () => {
  it.skip('skipped: no container runtime', () => {});
});
