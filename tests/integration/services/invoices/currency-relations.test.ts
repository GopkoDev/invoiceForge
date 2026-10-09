// invoice-integrity T06 (spec.md §5 AC-11, AC-12) — verifyInvoiceRelations checks the bank account's
// currency and every catalogue line product's currency (inactive included) against the invoice's;
// free-text lines are not checked; a foreign record is still NOT_FOUND.
// docs/features/invoice-integrity/tasks/t06-currency-relations.md
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../../support/db/container';
import { createTestPrismaClient } from '../../../support/db/client';
import { truncateAllTables } from '../../../support/db/truncate';
import { createFreelancer } from '../../../support/factories/user';
import { createSenderProfile } from '../../../support/factories/sender-profile';
import { createBankAccount } from '../../../support/factories/bank-account';
import { createCustomer } from '../../../support/factories/customer';
import { createProduct } from '../../../support/factories/product';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

let testClient: PrismaClient;
vi.mock('@/prisma', () => ({ prisma: new Proxy({}, { get: (_t, k) => (testClient as never)[k] }) }));

type Helpers = typeof import('@/lib/services/invoices/helpers');

describe.runIf(containerRuntimeAvailable)('verifyInvoiceRelations — currencies (T06, AC-11, AC-12)', () => {
  let db: TestDatabase;
  let helpers: Helpers;

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    testClient = createTestPrismaClient(db.connectionString);
    helpers = await import('@/lib/services/invoices/helpers');
  }, 60_000);

  afterAll(async () => {
    await testClient?.$disconnect();
    await db?.stop();
  });

  afterEach(async () => {
    await truncateAllTables(testClient);
  });

  async function seed() {
    const user = await createFreelancer(testClient);
    const profile = await createSenderProfile(testClient, user.id);
    const customer = await createCustomer(testClient, user.id);
    const eurAccount = await createBankAccount(testClient, profile.id, { currency: 'EUR' });
    const usdAccount = await createBankAccount(testClient, profile.id, { currency: 'USD' });
    const usdProduct = await createProduct(testClient, user.id, { name: 'Consulting', currency: 'USD' });
    const retiredUsd = await createProduct(testClient, user.id, {
      name: 'Old service',
      currency: 'USD',
      isActive: false,
    });
    const eurProduct = await createProduct(testClient, user.id, { name: 'Design', currency: 'EUR' });
    return { user, profile, customer, eurAccount, usdAccount, usdProduct, retiredUsd, eurProduct };
  }

  it('AC-11: a USD account on a EUR invoice → fieldErrors.bankAccountId', async () => {
    const s = await seed();
    const result = await helpers.verifyInvoiceRelations(s.user.id, s.profile.id, s.customer.id, s.usdAccount.id, {
      currency: 'EUR',
      items: [],
    });
    expect(result.success && result.data.fieldErrors).toEqual({
      bankAccountId: ['This account is in USD while the invoice is in EUR.'],
    });
  });

  it('AC-12: active and inactive USD product lines on a EUR invoice are named; free text and EUR lines pass', async () => {
    const s = await seed();
    const result = await helpers.verifyInvoiceRelations(s.user.id, s.profile.id, s.customer.id, s.eurAccount.id, {
      currency: 'EUR',
      items: [
        { productId: s.usdProduct.id },
        { productId: undefined },
        { productId: 'custom' },
        { productId: s.eurProduct.id },
        { productId: s.retiredUsd.id },
      ],
    });
    expect(result.success && result.data.fieldErrors).toEqual({
      'items.0.productId': ['“Consulting” is priced in USD while the invoice is in EUR.'],
      'items.4.productId': ['“Old service” is priced in USD while the invoice is in EUR.'],
    });
  });

  it('account and a line both mismatching → both keys together', async () => {
    const s = await seed();
    const result = await helpers.verifyInvoiceRelations(s.user.id, s.profile.id, s.customer.id, s.usdAccount.id, {
      currency: 'EUR',
      items: [{ productId: s.usdProduct.id }],
    });
    expect(result.success && Object.keys(result.data.fieldErrors).sort()).toEqual([
      'bankAccountId',
      'items.0.productId',
    ]);
  });

  it('matching currencies → no field errors', async () => {
    const s = await seed();
    const result = await helpers.verifyInvoiceRelations(s.user.id, s.profile.id, s.customer.id, s.eurAccount.id, {
      currency: 'EUR',
      items: [{ productId: s.eurProduct.id }],
    });
    expect(result.success && result.data.fieldErrors).toEqual({});
  });

  it('a foreign bank account or product is still NOT_FOUND', async () => {
    const s = await seed();
    const other = await createFreelancer(testClient);
    const otherProfile = await createSenderProfile(testClient, other.id);
    const foreignAccount = await createBankAccount(testClient, otherProfile.id, { currency: 'EUR' });
    const foreignProduct = await createProduct(testClient, other.id, { currency: 'USD' });

    const account = await helpers.verifyInvoiceRelations(s.user.id, s.profile.id, s.customer.id, foreignAccount.id, {
      currency: 'EUR',
      items: [],
    });
    expect(account).toMatchObject({ success: false, code: 'NOT_FOUND' });

    const product = await helpers.verifyInvoiceRelations(s.user.id, s.profile.id, s.customer.id, s.eurAccount.id, {
      currency: 'EUR',
      items: [{ productId: foreignProduct.id }],
    });
    expect(product).toMatchObject({ success: false, code: 'NOT_FOUND', error: 'Product not found.' });
  });

  it('runs on a transaction client passed in', async () => {
    const s = await seed();
    const result = await testClient.$transaction((tx) =>
      helpers.verifyInvoiceRelations(
        s.user.id,
        s.profile.id,
        s.customer.id,
        s.usdAccount.id,
        { currency: 'EUR', items: [] },
        tx
      )
    );
    expect(result.success && result.data.fieldErrors).toEqual({
      bankAccountId: ['This account is in USD while the invoice is in EUR.'],
    });
  });
});

describe.runIf(!containerRuntimeAvailable)('verifyInvoiceRelations — currencies (T06)', () => {
  it.skip('skipped: no container runtime', () => {});
});
