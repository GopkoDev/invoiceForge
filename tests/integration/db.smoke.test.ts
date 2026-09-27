import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { isContainerRuntimeAvailable } from '../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../support/db/container';
import { createTestPrismaClient } from '../support/db/client';
import { truncateAllTables } from '../support/db/truncate';
import { createFreelancer } from '../support/factories/user';
import { createSenderProfile } from '../support/factories/sender-profile';
import { createBankAccount } from '../support/factories/bank-account';
import { createCustomer } from '../support/factories/customer';
import { createInvoice } from '../support/factories/invoice';
import type { PrismaClient } from '@prisma/client';

// Edge case: "No container runtime on the machine -> Integration and e2e suites report
// 'skipped: no container runtime' and never fall back to the .env database."
const containerRuntimeAvailable = await isContainerRuntimeAvailable();

describe.runIf(containerRuntimeAvailable)('throwaway database (integration smoke)', () => {
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

  beforeEach(async () => {
    await truncateAllTables(prisma);
  });

  it('applies migrations and lets factories build a full invoice graph', async () => {
    const freelancer = await createFreelancer(prisma);
    const senderProfile = await createSenderProfile(prisma, freelancer.id);
    const bankAccount = await createBankAccount(prisma, senderProfile.id);
    const customer = await createCustomer(prisma, freelancer.id);

    const invoice = await createInvoice(prisma, { senderProfile, customer, bankAccount });

    expect(invoice.senderProfileId).toBe(senderProfile.id);
    expect(invoice.items).toHaveLength(1);

    const count = await prisma.invoice.count();
    expect(count).toBe(1);
  });

  it('truncates between tests (no leftover row from the previous test)', async () => {
    const count = await prisma.invoice.count();
    expect(count).toBe(0);
  });
});

describe.runIf(!containerRuntimeAvailable)('throwaway database (integration smoke)', () => {
  it.skip('skipped: no container runtime', () => {});
});
