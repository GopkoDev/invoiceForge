// invoice-integrity T20 (sad.md §7 Deployment view; data-model.md §Pre-release count-only report) —
// the count-only report prints one count per category and writes nothing. Each category is seeded
// once; the default categories need the partial unique indexes dropped for the duration (they are
// what the release migration creates), so the test recreates them afterwards.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../support/db/container';
import { createTestPrismaClient } from '../support/db/client';
import { truncateAllTables } from '../support/db/truncate';
import { createFreelancer } from '../support/factories/user';
import { createSenderProfile } from '../support/factories/sender-profile';
import { createBankAccount } from '../support/factories/bank-account';
import { createCustomer } from '../support/factories/customer';
import { createProduct } from '../support/factories/product';
import { createInvoice } from '../support/factories/invoice';
import { invoiceIntegrityReport, formatReport } from '../../scripts/invoice-integrity-report';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

const ZERO = {
  usersWithSeveralDefaultProfiles: 0,
  usersWithProfilesButNoDefault: 0,
  profilesWithSeveralDefaultAccounts: 0,
  profilesWithAccountsButNoDefault: 0,
  accountCurrencyMismatch: { draft: 0, issued: 0 },
  lineCurrencyMismatch: { draft: 0, issued: 0 },
  dueBeforeIssue: 0,
  impossibleStatusHistory: 0,
  amountOverLimit: 0,
  issuedAfterRelatedChange: 0,
};

describe.runIf(containerRuntimeAvailable)('invoice-integrity pre-release report (T20)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;

  beforeAll(async () => {
    db = await startTestDatabase();
    prisma = createTestPrismaClient(db.connectionString);
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  afterEach(async () => {
    await truncateAllTables(prisma);
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "SenderProfile_userId_isDefault_key" ON "SenderProfile"("userId") WHERE ("isDefault" = true)`
    );
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "BankAccount_senderProfileId_isDefault_key" ON "BankAccount"("senderProfileId") WHERE ("isDefault" = true)`
    );
  });

  it('an empty database reports 0 everywhere', async () => {
    expect(await invoiceIntegrityReport(prisma)).toEqual(ZERO);
  });

  it('one record per category is counted once, and the run writes nothing', async () => {
    await prisma.$executeRawUnsafe(`DROP INDEX "SenderProfile_userId_isDefault_key"`);
    await prisma.$executeRawUnsafe(`DROP INDEX "BankAccount_senderProfileId_isDefault_key"`);

    // Freelancer with two default profiles; one of those profiles has two default accounts.
    const twoDefaults = await createFreelancer(prisma);
    const p1 = await createSenderProfile(prisma, twoDefaults.id, { isDefault: true });
    await createSenderProfile(prisma, twoDefaults.id, { isDefault: true });
    const usd = await createBankAccount(prisma, p1.id, { isDefault: true, currency: 'USD' });
    await createBankAccount(prisma, p1.id, { isDefault: true, currency: 'USD' });

    // Freelancer with profiles but no default; that profile has accounts but no default.
    const noDefault = await createFreelancer(prisma);
    const p2 = await createSenderProfile(prisma, noDefault.id, { isDefault: false });
    await createBankAccount(prisma, p2.id, { isDefault: false });

    const customer = await createCustomer(prisma, twoDefaults.id);
    const eurProduct = await createProduct(prisma, twoDefaults.id, { currency: 'EUR' });
    const base = { senderProfile: p1, customer, bankAccount: usd };
    const day = (d: string) => new Date(`${d}T00:00:00.000Z`);

    // Account currency mismatch: one draft, one issued.
    await createInvoice(prisma, { ...base, overrides: { invoiceNumber: 'R-1', currency: 'EUR' } });
    await createInvoice(prisma, { ...base, overrides: { invoiceNumber: 'R-2', currency: 'EUR', status: 'PENDING' } });
    // A catalogue line in another currency (two lines, counted once): issued.
    const line = { productId: eurProduct.id, name: 'EUR thing', quantity: 1, rate: 10, amount: 10 };
    await createInvoice(prisma, { ...base, items: [line, line], overrides: { invoiceNumber: 'R-3', status: 'PAID', paidAt: new Date() } });
    // Due date before the issue date (a draft).
    await createInvoice(prisma, { ...base, overrides: { invoiceNumber: 'R-4', issueDate: day('2026-03-10'), dueDate: day('2026-03-05') } });
    // Impossible status history: PAID without a payment date.
    await createInvoice(prisma, { ...base, overrides: { invoiceNumber: 'R-5', status: 'PAID', paidAt: null } });

    // Every issued invoice above was created before the related records' updatedAt moves now.
    await prisma.customer.update({ where: { id: customer.id }, data: { address: 'moved' } });

    const before = {
      invoices: await prisma.invoice.findMany({ orderBy: { id: 'asc' } }),
      profiles: await prisma.senderProfile.findMany({ orderBy: { id: 'asc' } }),
      accounts: await prisma.bankAccount.findMany({ orderBy: { id: 'asc' } }),
    };

    const report = await invoiceIntegrityReport(prisma);
    expect(report).toEqual({
      usersWithSeveralDefaultProfiles: 1,
      usersWithProfilesButNoDefault: 1,
      profilesWithSeveralDefaultAccounts: 1,
      profilesWithAccountsButNoDefault: 1,
      accountCurrencyMismatch: { draft: 1, issued: 1 },
      lineCurrencyMismatch: { draft: 0, issued: 1 },
      dueBeforeIssue: 1,
      impossibleStatusHistory: 1,
      amountOverLimit: 0,
      issuedAfterRelatedChange: 3,
    });

    expect({
      invoices: await prisma.invoice.findMany({ orderBy: { id: 'asc' } }),
      profiles: await prisma.senderProfile.findMany({ orderBy: { id: 'asc' } }),
      accounts: await prisma.bankAccount.findMany({ orderBy: { id: 'asc' } }),
    }).toEqual(before);

    const text = formatReport(report);
    expect(text).toContain('Freelancers with more than one default sender profile: 1');
    expect(text).toContain('Invoices whose currency differs from their bank account: draft 1, issued 1');
  });
});

describe.runIf(!containerRuntimeAvailable)('invoice-integrity pre-release report (T20)', () => {
  it.skip('skipped: no container runtime', () => {});
});
