// invoice-integrity T10 (spec.md §5 AC-06, AC-23; contracts/server-actions.md §deleteInvoice) — only a
// draft can be deleted, under the row lock; a non-draft is VALIDATION with STATUS_NOT_ALLOWED (was
// CONFLICT); another Freelancer's invoice is NOT_FOUND.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { InvoiceStatus, PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../../support/db/container';
import { createTestPrismaClient } from '../../../support/db/client';
import { truncateAllTables } from '../../../support/db/truncate';
import { createFreelancer } from '../../../support/factories/user';
import { createCustomer } from '../../../support/factories/customer';
import { createSenderProfile } from '../../../support/factories/sender-profile';
import { createBankAccount } from '../../../support/factories/bank-account';
import { createInvoice } from '../../../support/factories/invoice';
import { actingFreelancerForTest } from '../../../support/acting-freelancer';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

type Svc = typeof import('@/lib/services/invoices/invoices');

const ONLY_DRAFTS =
  'Only drafts can be deleted. An issued invoice can be cancelled instead; a cancelled invoice is final and stays listed.';

describe.runIf(containerRuntimeAvailable)('deleteInvoice (T10)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;
  let svc: Svc;

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

  afterEach(async () => {
    await truncateAllTables(prisma);
  });

  async function seed(status: InvoiceStatus) {
    const user = await createFreelancer(prisma);
    const actor = await actingFreelancerForTest(user.id, 'UTC');
    const senderProfile = await createSenderProfile(prisma, user.id);
    const customer = await createCustomer(prisma, user.id);
    const bankAccount = await createBankAccount(prisma, senderProfile.id);
    const invoice = await createInvoice(prisma, { senderProfile, customer, bankAccount, overrides: { status } });
    return { actor, invoice };
  }

  it('a draft is deleted with its lines', async () => {
    const s = await seed('DRAFT');
    expect(await svc.deleteInvoice(s.actor, s.invoice.id)).toEqual({ success: true, data: undefined });
    expect(await prisma.invoice.count()).toBe(0);
    expect(await prisma.invoiceItem.count()).toBe(0);
  });

  it.each(['PENDING', 'OVERDUE', 'PAID', 'CANCELLED'] as const)(
    'a %s invoice is refused with VALIDATION and stays listed',
    async (status) => {
      const s = await seed(status);
      expect(await svc.deleteInvoice(s.actor, s.invoice.id)).toEqual({
        success: false,
        code: 'VALIDATION',
        error: ONLY_DRAFTS,
        details: { kind: 'STATUS_NOT_ALLOWED', currentStatus: status, suggestion: null },
      });
      expect(await prisma.invoice.count()).toBe(1);
    }
  );

  it("another Freelancer's draft is NOT_FOUND and not deleted", async () => {
    const s = await seed('DRAFT');
    const other = await createFreelancer(prisma);
    const otherActor = await actingFreelancerForTest(other.id, 'UTC');
    expect(await svc.deleteInvoice(otherActor, s.invoice.id)).toEqual({
      success: false,
      code: 'NOT_FOUND',
      error: 'Invoice not found.',
    });
    expect(await prisma.invoice.count()).toBe(1);
  });
});

describe.runIf(!containerRuntimeAvailable)('deleteInvoice (T10)', () => {
  it.skip('skipped: no container runtime', () => {});
});
