// invoice-integrity T26 (review F7; spec.md §5 AC-11, AC-12, AC-13, AC-13b; sad.md §6 flow 3; ADR-0002,
// ADR-0005) — a currency change on a bank account or product that commits while an invoice save is in
// flight can never leave an invoice whose currency differs from its bank account or line product.
// Deterministic interleaving: a side transaction takes the SAME lock the currency change takes
// (the sender-profile row for an account, the product row for a product), switches the currency to
// EUR and stays open; the save starts and blocks on that lock; only then does the side transaction
// commit. A save that checked the currency before taking the lock would then write a stale USD invoice.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { BankAccount, Customer, PrismaClient, SenderProfile } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../../support/db/container';
import { createTestPrismaClient } from '../../../support/db/client';
import { truncateAllTables } from '../../../support/db/truncate';
import { commitWhileBlocked } from '../../../support/db/row-lock-race';
import { createFreelancer } from '../../../support/factories/user';
import { createCustomer } from '../../../support/factories/customer';
import { createProduct } from '../../../support/factories/product';
import { createSenderProfile } from '../../../support/factories/sender-profile';
import { createBankAccount } from '../../../support/factories/bank-account';
import { createInvoice } from '../../../support/factories/invoice';
import { actingFreelancerForTest } from '../../../support/acting-freelancer';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

vi.mock('@sentry/nextjs', () => ({
  startSpan: (_options: unknown, callback: () => unknown) => callback(),
  captureMessage: vi.fn(),
}));

const RUNS = 20;

describe.runIf(containerRuntimeAvailable)('currency changes vs in-flight invoice saves (T26, F7)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;
  let svc: typeof import('@/lib/services/invoices/invoices');

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    prisma = createTestPrismaClient(db.connectionString);
    svc = await import('@/lib/services/invoices/invoices');
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  async function seed() {
    await truncateAllTables(prisma);
    const user = await createFreelancer(prisma);
    const actor = await actingFreelancerForTest(user.id, 'UTC');
    const senderProfile = await createSenderProfile(prisma, user.id);
    const account = await createBankAccount(prisma, senderProfile.id, { currency: 'USD' });
    const spare = await createBankAccount(prisma, senderProfile.id, { currency: 'USD' });
    const customer = await createCustomer(prisma, user.id);
    const product = await createProduct(prisma, user.id, { currency: 'USD' });
    return { user, actor, senderProfile, account, spare, customer, product };
  }
  type Seed = Awaited<ReturnType<typeof seed>>;

  function form(s: Seed, over: Record<string, unknown> = {}, productId?: string) {
    return {
      invoiceNumber: '',
      status: 'DRAFT',
      senderProfileId: s.senderProfile.id,
      bankAccountId: s.account.id,
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
      items: [{ id: 'item-0', productId, productName: 'Widget', unit: 'pcs', quantity: 1, price: 100, total: 100 }],
      ...over,
    };
  }

  // What updateBankAccount / updateProduct do while counting zero invoices: hold the lock they hold
  // and switch the currency; the commit is released by commitWhileBlocked.
  const switchAccount = (s: Seed, accountId: string) => async (tx: Parameters<Parameters<typeof commitWhileBlocked>[1]>[0]) => {
    await tx.$queryRaw`SELECT 1 FROM "SenderProfile" WHERE id = ${s.senderProfile.id} FOR UPDATE`;
    // The account row is locked too, so even a save that never takes the profile lock (and only
    // checks the foreign key) is held back until the commit instead of finishing before it.
    await tx.$queryRaw`SELECT 1 FROM "BankAccount" WHERE id = ${accountId} FOR UPDATE`;
    await tx.bankAccount.update({ where: { id: accountId }, data: { currency: 'EUR' } });
  };
  const switchProduct = (s: Seed) => async (tx: Parameters<Parameters<typeof commitWhileBlocked>[1]>[0]) => {
    await tx.$queryRaw`SELECT 1 FROM "Product" WHERE id = ${s.product.id} FOR UPDATE`;
    await tx.product.update({ where: { id: s.product.id }, data: { currency: 'EUR' } });
  };

  /** Invoices (other than `except`) whose currency differs from their bank account or a line product. */
  async function mismatches(except: string[] = []) {
    const [{ n }] = await prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM "Invoice" i
      WHERE i.id <> ALL(${except}::text[]) AND (
        EXISTS (SELECT 1 FROM "BankAccount" b WHERE b.id = i."bankAccountId" AND b.currency <> i.currency)
        OR EXISTS (SELECT 1 FROM "InvoiceItem" ii JOIN "Product" p ON p.id = ii."productId"
                   WHERE ii."invoiceId" = i.id AND p.currency <> i.currency))`;
    return n;
  }

  type Run = (s: Seed) => Promise<{ success: boolean; code?: string; fieldErrors?: Record<string, string[]> }>;

  async function race(name: string, prepare: (s: Seed) => Promise<{ except: string[]; call: Run; sideWrite: (s: Seed) => ReturnType<typeof switchAccount> }>, field: string) {
    let refused = 0;
    let bad = 0;
    for (let run = 0; run < RUNS; run++) {
      const s = await seed();
      const { except, call, sideWrite } = await prepare(s);
      const result = await commitWhileBlocked(prisma, sideWrite(s), () => call(s));
      if (!result.success && result.code === 'VALIDATION' && result.fieldErrors?.[field]) refused++;
      bad += await mismatches(except);
    }
    expect({ name, mismatches: bad, refused }).toEqual({ name, mismatches: 0, refused: RUNS });
  }

  const draftOf = (s: Seed, bankAccount: BankAccount, productId?: string) =>
    createInvoice(prisma, {
      senderProfile: s.senderProfile as SenderProfile,
      customer: s.customer as Customer,
      bankAccount,
      items: [{ productId, name: 'Widget', quantity: 1, rate: 100, amount: 100 }],
      overrides: { invoiceNumber: 'SRC-1', status: 'DRAFT', currency: 'USD' },
    });
  const storedForm = (s: Seed, inv: Awaited<ReturnType<typeof draftOf>>, over: Record<string, unknown>, productId?: string) =>
    form(s, { invoiceNumber: inv.invoiceNumber, loadedVersion: inv.version, ...over }, productId);

  it('createInvoice: an account switched to EUR meanwhile is refused (AC-13, AC-11)', async () => {
    await race('create/account', async () => ({
      except: [],
      sideWrite: (s) => switchAccount(s, s.account.id),
      call: (s) => svc.createInvoice(s.actor, form(s) as never),
    }), 'bankAccountId');
  }, 120_000);

  it('createInvoice: a product switched to EUR meanwhile is refused (AC-13b, AC-12)', async () => {
    await race('create/product', async () => ({
      except: [],
      sideWrite: (s) => switchProduct(s),
      call: (s) => svc.createInvoice(s.actor, form(s, {}, s.product.id) as never),
    }), 'items.0.productId');
  }, 120_000);

  it('duplicateInvoice: an account switched to EUR meanwhile is refused (AC-13, AC-11)', async () => {
    await race('duplicate/account', async (s) => {
      const source = await draftOf(s, s.account);
      return {
        except: [source.id],
        sideWrite: (x) => switchAccount(x, x.account.id),
        call: (x) => svc.duplicateInvoice(x.actor, source.id) as ReturnType<Run>,
      };
    }, 'bankAccountId');
  }, 120_000);

  it('updateInvoice (draft, number unchanged): the account it moves to switched to EUR meanwhile is refused', async () => {
    await race('update/account', async (s) => {
      const inv = await draftOf(s, s.account);
      return {
        except: [],
        sideWrite: (x) => switchAccount(x, x.spare.id),
        call: (x) => svc.updateInvoice(x.actor, inv.id, storedForm(x, inv, { bankAccountId: x.spare.id }) as never),
      };
    }, 'bankAccountId');
  }, 120_000);

  it('updateInvoice (draft): a line product switched to EUR meanwhile is refused', async () => {
    await race('update/product', async (s) => {
      const inv = await draftOf(s, s.account);
      return {
        except: [],
        sideWrite: (x) => switchProduct(x),
        call: (x) => svc.updateInvoice(x.actor, inv.id, storedForm(x, inv, {}, x.product.id) as never),
      };
    }, 'items.0.productId');
  }, 120_000);
});
