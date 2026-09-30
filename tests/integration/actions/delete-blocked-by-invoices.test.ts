// T19 (spec.md §5 AC-22) — deleteCustomer / deleteSenderProfile refuse to delete a record that
// has invoices, with the count, per docs/features/architecture-hardening/tasks/
// t19-block-deleting-records-with-invoices.md (Inlined context: contracts/server-actions.md
// §deleteSenderProfile / deleteCustomer, verbatim; screens.md §SCR-14, verbatim; sad.md §8 Hard
// rule; spec.md §1 Committed approach) and the test-plan.md rows for AC-22 (below).
//
// test-plan.md rows exercised here (§AC-22, integration):
//   - "deleting a Customer or sender profile with invoices is blocked with the count" — CONFLICT
//     "N invoices depend on it", for both entity types. No invoice or record is removed.
//   - "invoice added between the count and the delete still blocks the deletion" — the database
//     restrict violation maps to the same "N invoices depend on it" refusal, not FAILED.
//
// Assumed API/result shapes (task file §API contract, verbatim; types/actions.ts ActionResult):
//   deleteCustomer(id): Promise<ActionResult<void>>
//   deleteSenderProfile(id): Promise<ActionResult<void>>
//   on N >= 1 invoices: CONFLICT, details: { kind: 'HAS_INVOICES', invoiceCount: N },
//     error: "N invoices depend on this customer, so it can't be deleted." (or "...this sender
//     profile...")
//   not found / not owned: NOT_FOUND
//   a P2003 Restrict violation between the count and the delete: the same CONFLICT, recounted —
//     never FAILED
//
// Seams: same-process app code (tests/README.md option 1), same pattern as
// account-deletion.test.ts: DATABASE_URL + vi.resetModules() + dynamic import, mock '@/auth',
// stub 'next/cache'. The race rows use a real throwaway Postgres container (per test-plan.md
// §Integration dependency, "the AC-07 and AC-22 race tests need real parallel connections") and
// simulate the concurrent insert deterministically with a BEFORE DELETE trigger on the
// Customer/SenderProfile row that inserts a real Invoice row referencing it just before the
// DELETE statement itself runs — the same fault-injection tactic as the T17
// account-deletion.test.ts rollback test, adapted to force a live P2003 Restrict violation
// instead of an application-level trigger failure.
//
// RED (T19 not yet implemented):
//   (a) deleteCustomer/deleteSenderProfile already return CONFLICT + HAS_INVOICES today, but with
//       the wrong wording ("Cannot delete customer with N invoice(s)...", not the contract's
//       "N invoices depend on this customer, so it can't be deleted.")
//   (b) neither action catches a P2003 (Prisma's Restrict-FK violation code) around the delete
//       call, so the race case falls into the generic catch and returns FAILED, not CONFLICT
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../support/db/container';
import { createTestPrismaClient } from '../../support/db/client';
import { truncateAllTables } from '../../support/db/truncate';
import { createFreelancer } from '../../support/factories/user';
import { createSenderProfile } from '../../support/factories/sender-profile';
import { createCustomer } from '../../support/factories/customer';
import { createBankAccount } from '../../support/factories/bank-account';
import { createInvoice as seedInvoiceRow } from '../../support/factories/invoice';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

// --- mock '@/auth' so a test drives the session outcome directly (same seam as
// account-deletion.test.ts). ---------------------------------------------------------------
const authMock = vi.fn<() => Promise<{ user: { id: string } } | null>>();
vi.mock('@/auth', () => ({ auth: () => authMock() }));

// --- next/cache's revalidatePath needs a live request/static-generation store, which this
// same-process (non-served) import never has. Stubbed out, orthogonal to what this suite tests. -
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

type ActionResult<T> =
  | { success: true; data: T }
  | {
      success: false;
      code: string;
      error: string;
      details?: { kind: string; invoiceCount?: number };
    };
type DeleteCustomer = (id: string) => Promise<ActionResult<void>>;
type DeleteSenderProfile = (id: string) => Promise<ActionResult<void>>;

describe.runIf(containerRuntimeAvailable)(
  'deleteCustomer / deleteSenderProfile (T19, AC-22)',
  () => {
    let db: TestDatabase;
    let prisma: PrismaClient;
    let deleteCustomer: DeleteCustomer;
    let deleteSenderProfile: DeleteSenderProfile;

    beforeAll(async () => {
      db = await startTestDatabase();
      process.env.DATABASE_URL = db.connectionString;
      vi.resetModules();
      prisma = createTestPrismaClient(db.connectionString);
      ({ deleteCustomer } = (await import('@/lib/actions/customer-actions')) as unknown as {
        deleteCustomer: DeleteCustomer;
      });
      ({ deleteSenderProfile } = (await import(
        '@/lib/actions/sender-profile-actions'
      )) as unknown as { deleteSenderProfile: DeleteSenderProfile });
    }, 60_000);

    afterAll(async () => {
      await prisma?.$disconnect();
      await db?.stop();
    });

    beforeEach(() => {
      authMock.mockReset();
    });

    afterEach(async () => {
      await truncateAllTables(prisma);
    });

    /** Freelancer + sender profile + bank account + customer, ready to attach invoices to. */
    async function seedOwnerGraph(suffix: string) {
      const freelancer = await createFreelancer(prisma, { email: `owner-${suffix}@example.com` });
      const senderProfile = await createSenderProfile(prisma, freelancer.id);
      const bankAccount = await createBankAccount(prisma, senderProfile.id);
      const customer = await createCustomer(prisma, freelancer.id);
      return { freelancer, senderProfile, bankAccount, customer };
    }

    /**
     * Simulates "an invoice was saved between the count and the delete" (AC-22 race): right after
     * the action's own counting query returns (still 0 invoices), another connection — this test's
     * client — commits a real invoice for the record. The action's DELETE then hits a genuine,
     * persisted Restrict-FK violation (P2003), and its recount can see the committed invoice.
     * (An in-statement BEFORE DELETE trigger can't model this: the failing DELETE rolls back the
     * trigger's own insert, so nothing is ever committed to recount.)
     */
    async function armRaceAfterCount(params: {
      model: 'customer' | 'senderProfile';
      owner: Awaited<ReturnType<typeof seedOwnerGraph>>;
    }) {
      const { prisma: appPrisma } = (await import('@/prisma')) as unknown as {
        prisma: PrismaClient;
      };
      type Lookup = (...args: unknown[]) => Promise<unknown>;
      const delegate = appPrisma[params.model] as unknown as {
        findFirst: Lookup;
        findUnique: Lookup;
      };
      // Whichever lookup the action counts with, the invoice is committed right after it.
      let raced = false;
      const spies = (['findFirst', 'findUnique'] as const).map((method) => {
        const countingQuery = delegate[method].bind(delegate);
        return vi.spyOn(delegate, method).mockImplementation(async (...args) => {
          const counted = await countingQuery(...args);
          if (!raced) {
            raced = true;
            await seedInvoiceRow(prisma, {
              senderProfile: params.owner.senderProfile,
              customer: params.owner.customer,
              bankAccount: params.owner.bankAccount,
              overrides: { invoiceNumber: 'T19-RACE-0001' },
            });
          }
          return counted;
        });
      });
      return () => spies.forEach((spy) => spy.mockRestore());
    }

    it('AC-22: deleteCustomer blocks a Customer with invoices, with the exact count, and removes nothing', async () => {
      const owner = await seedOwnerGraph('cust-blocked');
      for (let i = 1; i <= 3; i++) {
        await seedInvoiceRow(prisma, {
          senderProfile: owner.senderProfile,
          customer: owner.customer,
          bankAccount: owner.bankAccount,
          overrides: { invoiceNumber: `${owner.senderProfile.invoicePrefix}-000${i}` },
        });
      }
      authMock.mockResolvedValue({ user: { id: owner.freelancer.id } });

      const result = await deleteCustomer(owner.customer.id);

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('CONFLICT');
      expect(result.details).toEqual({ kind: 'HAS_INVOICES', invoiceCount: 3 });
      expect(result.error).toBe(
        "3 invoices depend on this customer, so it can't be deleted."
      );

      const stillThere = await prisma.customer.findUnique({ where: { id: owner.customer.id } });
      expect(stillThere).not.toBeNull();
      const invoiceCount = await prisma.invoice.count({ where: { customerId: owner.customer.id } });
      expect(invoiceCount).toBe(3);
    });

    it('AC-22: deleteSenderProfile blocks a sender profile with invoices, with the exact count, and removes nothing', async () => {
      const owner = await seedOwnerGraph('profile-blocked');
      await seedInvoiceRow(prisma, {
        senderProfile: owner.senderProfile,
        customer: owner.customer,
        bankAccount: owner.bankAccount,
      });
      authMock.mockResolvedValue({ user: { id: owner.freelancer.id } });

      const result = await deleteSenderProfile(owner.senderProfile.id);

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('CONFLICT');
      expect(result.details).toEqual({ kind: 'HAS_INVOICES', invoiceCount: 1 });
      expect(result.error).toBe(
        "1 invoice depends on this sender profile, so it can't be deleted."
      );

      const stillThere = await prisma.senderProfile.findUnique({
        where: { id: owner.senderProfile.id },
      });
      expect(stillThere).not.toBeNull();
    });

    it('AC-22: deleteCustomer deletes a Customer with no invoices', async () => {
      const owner = await seedOwnerGraph('cust-clean');
      authMock.mockResolvedValue({ user: { id: owner.freelancer.id } });

      const result = await deleteCustomer(owner.customer.id);

      expect(result.success).toBe(true);
      const gone = await prisma.customer.findUnique({ where: { id: owner.customer.id } });
      expect(gone).toBeNull();
    });

    it('AC-22: deleteCustomer returns NOT_FOUND for a foreign or unknown id, and removes nothing', async () => {
      const owner = await seedOwnerGraph('cust-foreign-owner');
      const other = await seedOwnerGraph('cust-foreign-other');
      authMock.mockResolvedValue({ user: { id: owner.freelancer.id } });

      const result = await deleteCustomer(other.customer.id);

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('NOT_FOUND');

      const stillThere = await prisma.customer.findUnique({ where: { id: other.customer.id } });
      expect(stillThere).not.toBeNull();
    });

    it('AC-22: an invoice saved between the count and the delete still blocks deleteCustomer — CONFLICT, recounted, never FAILED', async () => {
      const owner = await seedOwnerGraph('cust-race');
      authMock.mockResolvedValue({ user: { id: owner.freelancer.id } });
      // At count time, this Customer truly has 0 invoices.
      const preCount = await prisma.invoice.count({ where: { customerId: owner.customer.id } });
      expect(preCount).toBe(0);

      const cleanup = await armRaceAfterCount({ model: 'customer', owner });

      try {
        const result = await deleteCustomer(owner.customer.id);

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.code).toBe('CONFLICT');
        expect(result.details).toEqual({ kind: 'HAS_INVOICES', invoiceCount: 1 });

        const stillThere = await prisma.customer.findUnique({ where: { id: owner.customer.id } });
        expect(stillThere).not.toBeNull();
      } finally {
        cleanup();
      }
    });

    it('AC-22: an invoice saved between the count and the delete still blocks deleteSenderProfile — CONFLICT, recounted, never FAILED', async () => {
      const owner = await seedOwnerGraph('profile-race');
      authMock.mockResolvedValue({ user: { id: owner.freelancer.id } });
      const preCount = await prisma.invoice.count({
        where: { senderProfileId: owner.senderProfile.id },
      });
      expect(preCount).toBe(0);

      const cleanup = await armRaceAfterCount({ model: 'senderProfile', owner });

      try {
        const result = await deleteSenderProfile(owner.senderProfile.id);

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.code).toBe('CONFLICT');
        expect(result.details).toEqual({ kind: 'HAS_INVOICES', invoiceCount: 1 });

        const stillThere = await prisma.senderProfile.findUnique({
          where: { id: owner.senderProfile.id },
        });
        expect(stillThere).not.toBeNull();
      } finally {
        cleanup();
      }
    });
  }
);

describe.runIf(!containerRuntimeAvailable)('deleteCustomer / deleteSenderProfile (T19)', () => {
  it.skip('skipped: no container runtime', () => {});
});
