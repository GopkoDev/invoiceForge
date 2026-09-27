// T12 (spec.md §5 AC-06, AC-07, AC-09) — allocateInvoiceNumber(tx, senderProfileId), the
// row-locked allocator ADR-0005 decided on.
//
// docs/features/architecture-hardening/tasks/t12-numbering-module.md, Inlined context
// (adr/0005, sad.md §6 flow 2, data-model.md §Entities SenderProfile invoiceCounter, verbatim)
// + Checklist ("UPDATE ... SET invoiceCounter = invoiceCounter + 1 ... RETURNING; loop while
// isInvoiceKeyTaken -> increment again") + Edge cases table, and test-plan.md rows:
//   - AC-06 "saving with an empty number assigns the next number and advances the sequence"
//     (integration, allocator half — the response/hint half is T13)
//   - AC-07 "two concurrent saves with empty numbers both succeed with different numbers"
//     (integration: "Two saves under one profile on two separate connections, repeated 20
//     times: 40 of 40 succeed, all numbers are distinct, and the counter advances by 40.")
//   - AC-09 "proposed number already taken manually is skipped" (integration: "With next = 5
//     and 5 and 6 taken manually, a save with an empty number gets 7. The counter ends at 7 and
//     no 'already used' is returned.")
//
// Assumed API (task file §API contract, verbatim): `allocateInvoiceNumber(tx, senderProfileId)
// -> { invoiceNumber, invoiceNumberKey }`, called inside the CALLER's transaction (ADR-0005:
// "One allocator ... serves create, move (AC-11) and duplicate (AC-12)" — it locks the profile
// row and returns the number/key; it does not insert the invoice itself, that's the caller's
// job, exercised here directly since T13 (createInvoice on the allocator) hasn't landed yet).
// `tx` is a Prisma.TransactionClient, i.e. whatever `prisma.$transaction(async (tx) => ...)`
// hands the callback.
//
// Seams: same-process app code (tests/README.md option 1) — the module is pure Prisma, no auth,
// so no mocks are needed; only DATABASE_URL + vi.resetModules() + dynamic import.
//
// RED (T12 not yet implemented): lib/actions/invoice-actions/numbering.ts does not exist, so
// `allocateInvoiceNumber` fails to import.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient, Prisma, SenderProfile, Customer, BankAccount } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../support/db/container';
import { createTestPrismaClient } from '../../support/db/client';
import { truncateAllTables } from '../../support/db/truncate';
import { createFreelancer } from '../../support/factories/user';
import { createSenderProfile } from '../../support/factories/sender-profile';
import { createCustomer } from '../../support/factories/customer';
import { createBankAccount } from '../../support/factories/bank-account';
import { createInvoice } from '../../support/factories/invoice';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

type Allocation = { invoiceNumber: string; invoiceNumberKey: string };
type AllocateInvoiceNumber = (
  tx: Prisma.TransactionClient,
  senderProfileId: string
) => Promise<Allocation>;
type NormalizeInvoiceNumber = (s: string) => string;

describe.runIf(containerRuntimeAvailable)(
  'allocateInvoiceNumber (T12, AC-06, AC-07, AC-09)',
  () => {
    let db: TestDatabase;
    let prisma: PrismaClient;
    let allocateInvoiceNumber: AllocateInvoiceNumber;
    let normalizeInvoiceNumber: NormalizeInvoiceNumber;

    beforeAll(async () => {
      db = await startTestDatabase();
      process.env.DATABASE_URL = db.connectionString;
      prisma = createTestPrismaClient(db.connectionString);
      ({ allocateInvoiceNumber, normalizeInvoiceNumber } = (await import(
        '@/lib/actions/invoice-actions/numbering'
      )) as unknown as {
        allocateInvoiceNumber: AllocateInvoiceNumber;
        normalizeInvoiceNumber: NormalizeInvoiceNumber;
      });
    }, 60_000);

    afterAll(async () => {
      await prisma?.$disconnect();
      await db?.stop();
    });

    afterEach(async () => {
      await truncateAllTables(prisma);
    });

    async function seedProfile() {
      const freelancer = await createFreelancer(prisma);
      const senderProfile = await createSenderProfile(prisma, freelancer.id);
      const customer = await createCustomer(prisma, freelancer.id);
      const bankAccount = await createBankAccount(prisma, senderProfile.id);
      return { freelancer, senderProfile, customer, bankAccount };
    }

    /** Inserts a real Invoice row using an allocation, inside the given tx/client. */
    async function insertAllocated(
      client: PrismaClient | Prisma.TransactionClient,
      senderProfile: SenderProfile,
      customer: Customer,
      bankAccount: BankAccount,
      allocation: Allocation
    ) {
      return createInvoice(client as unknown as PrismaClient, {
        senderProfile,
        customer,
        bankAccount,
        overrides: {
          invoiceNumber: allocation.invoiceNumber,
          invoiceNumberKey: allocation.invoiceNumberKey,
        },
      });
    }

    /** Inserts a manual invoice (a filled-in number the Freelancer typed), never via the allocator. */
    async function insertManual(
      senderProfile: SenderProfile,
      customer: Customer,
      bankAccount: BankAccount,
      invoiceNumber: string
    ) {
      return createInvoice(prisma, {
        senderProfile,
        customer,
        bankAccount,
        overrides: {
          invoiceNumber,
          invoiceNumberKey: normalizeInvoiceNumber(invoiceNumber),
        },
      });
    }

    it('AC-06: allocates the next formatted number and advances invoiceCounter by 1', async () => {
      const { senderProfile, customer, bankAccount } = await seedProfile();

      const allocation = await prisma.$transaction(async (tx) => {
        const alloc = await allocateInvoiceNumber(tx, senderProfile.id);
        await insertAllocated(tx, senderProfile, customer, bankAccount, alloc);
        return alloc;
      });

      expect(allocation.invoiceNumber).toContain(senderProfile.invoicePrefix);
      expect(allocation.invoiceNumberKey).toBe(normalizeInvoiceNumber(allocation.invoiceNumber));

      const updated = await prisma.senderProfile.findUniqueOrThrow({
        where: { id: senderProfile.id },
      });
      expect(updated.invoiceCounter).toBe(senderProfile.invoiceCounter + 1);
    });

    it('AC-09: skips candidates already taken by manually typed numbers and lands on the first free one', async () => {
      const { senderProfile, customer, bankAccount } = await seedProfile();

      // Pre-take the next two candidates (counter 1 and 2) with manually typed numbers, using
      // whatever format the allocator itself would produce for those counters, computed via two
      // throwaway allocations that are then rolled back... instead, deterministically mirror the
      // production format so this test doesn't depend on allocateInvoiceNumber to seed its own
      // fixture. formatInvoiceNumber is exported alongside normalizeInvoiceNumber per the task's
      // API contract; import it too.
      const { formatInvoiceNumber } = (await import(
        '@/lib/actions/invoice-actions/numbering'
      )) as unknown as { formatInvoiceNumber: (prefix: string, n: number) => string };

      const first = formatInvoiceNumber(senderProfile.invoicePrefix, senderProfile.invoiceCounter + 1);
      const second = formatInvoiceNumber(senderProfile.invoicePrefix, senderProfile.invoiceCounter + 2);
      await insertManual(senderProfile, customer, bankAccount, first);
      // A whitespace/case variant, to also prove the skip check compares normalized keys, not
      // raw strings (AC-08 parity).
      await insertManual(senderProfile, customer, bankAccount, ` ${second.toLowerCase()} `);

      const allocation = await prisma.$transaction(async (tx) => {
        const alloc = await allocateInvoiceNumber(tx, senderProfile.id);
        await insertAllocated(tx, senderProfile, customer, bankAccount, alloc);
        return alloc;
      });

      const third = formatInvoiceNumber(senderProfile.invoicePrefix, senderProfile.invoiceCounter + 3);
      expect(allocation.invoiceNumber).toBe(third);

      const updated = await prisma.senderProfile.findUniqueOrThrow({
        where: { id: senderProfile.id },
      });
      expect(updated.invoiceCounter).toBe(senderProfile.invoiceCounter + 3);
    });

    it('a legacy invoice with a NULL invoiceNumberKey never blocks allocation, even if it normalizes to the candidate', async () => {
      const { senderProfile, customer, bankAccount } = await seedProfile();
      const { formatInvoiceNumber } = (await import(
        '@/lib/actions/invoice-actions/numbering'
      )) as unknown as { formatInvoiceNumber: (prefix: string, n: number) => string };
      const candidate = formatInvoiceNumber(senderProfile.invoicePrefix, senderProfile.invoiceCounter + 1);

      // Legacy row: a case/whitespace variant of the candidate with a NULL key (a backfill
      // duplicate, ADR-0004). NULL is distinct in the key unique and the allocator's "is this key
      // taken" check must agree. The text differs, so the exact-match unique kept until wave 4
      // (data-model.md) doesn't collide either.
      await createInvoice(prisma, {
        senderProfile,
        customer,
        bankAccount,
        overrides: { invoiceNumber: ` ${candidate.toLowerCase()} `, invoiceNumberKey: null },
      });

      const allocation = await prisma.$transaction(async (tx) => {
        const alloc = await allocateInvoiceNumber(tx, senderProfile.id);
        await insertAllocated(tx, senderProfile, customer, bankAccount, alloc);
        return alloc;
      });

      expect(allocation.invoiceNumber).toBe(candidate);
      expect(allocation.invoiceNumberKey).toBe(normalizeInvoiceNumber(candidate));
    });

    it('a unique violation that gets past the lock (exact-text legacy duplicate) propagates to the caller as P2002', async () => {
      const { senderProfile, customer, bankAccount } = await seedProfile();
      const { formatInvoiceNumber } = (await import(
        '@/lib/actions/invoice-actions/numbering'
      )) as unknown as { formatInvoiceNumber: (prefix: string, n: number) => string };
      const candidate = formatInvoiceNumber(senderProfile.invoicePrefix, senderProfile.invoiceCounter + 1);

      // Same exact text, NULL key: invisible to the key check, but the wave-2 exact-match unique
      // still rejects the insert. Edge-case table: P2002 propagates (T13 maps it to CONFLICT).
      await createInvoice(prisma, {
        senderProfile,
        customer,
        bankAccount,
        overrides: { invoiceNumber: candidate, invoiceNumberKey: null },
      });

      await expect(
        prisma.$transaction(async (tx) => {
          const alloc = await allocateInvoiceNumber(tx, senderProfile.id);
          await insertAllocated(tx, senderProfile, customer, bankAccount, alloc);
        })
      ).rejects.toMatchObject({ code: 'P2002' });
    });

    it('allocations in different sender profiles never contend and advance independently', async () => {
      const a = await seedProfile();
      const b = await seedProfile();

      const [allocA, allocB] = await Promise.all([
        prisma.$transaction(async (tx) => {
          const alloc = await allocateInvoiceNumber(tx, a.senderProfile.id);
          await insertAllocated(tx, a.senderProfile, a.customer, a.bankAccount, alloc);
          return alloc;
        }),
        prisma.$transaction(async (tx) => {
          const alloc = await allocateInvoiceNumber(tx, b.senderProfile.id);
          await insertAllocated(tx, b.senderProfile, b.customer, b.bankAccount, alloc);
          return alloc;
        }),
      ]);

      expect(allocA.invoiceNumberKey).not.toBe(allocB.invoiceNumberKey);
      const updatedA = await prisma.senderProfile.findUniqueOrThrow({ where: { id: a.senderProfile.id } });
      const updatedB = await prisma.senderProfile.findUniqueOrThrow({ where: { id: b.senderProfile.id } });
      expect(updatedA.invoiceCounter).toBe(a.senderProfile.invoiceCounter + 1);
      expect(updatedB.invoiceCounter).toBe(b.senderProfile.invoiceCounter + 1);
    });

    // AC-07 — test-plan.md: "Two saves under one profile on two separate connections, repeated
    // 20 times: 40 of 40 succeed, all numbers are distinct, and the counter advances by 40."
    it(
      'AC-07: 20 iterations of two concurrent saves on separate connections in one profile — 40 of 40 succeed, all distinct, counter advances by 40',
      async () => {
        const { senderProfile, customer, bankAccount } = await seedProfile();

        // Two separate connections/clients, so the two transactions in each iteration truly run
        // in parallel rather than serializing on a single shared connection.
        const clientA = createTestPrismaClient(db.connectionString);
        const clientB = createTestPrismaClient(db.connectionString);

        try {
          const results: Allocation[] = [];
          for (let i = 0; i < 20; i += 1) {
            const iterationResults = await Promise.all([
              clientA.$transaction(async (tx) => {
                const alloc = await allocateInvoiceNumber(tx, senderProfile.id);
                await insertAllocated(tx, senderProfile, customer, bankAccount, alloc);
                return alloc;
              }),
              clientB.$transaction(async (tx) => {
                const alloc = await allocateInvoiceNumber(tx, senderProfile.id);
                await insertAllocated(tx, senderProfile, customer, bankAccount, alloc);
                return alloc;
              }),
            ]);
            results.push(...iterationResults);
          }

          expect(results).toHaveLength(40);
          const distinctKeys = new Set(results.map((r) => r.invoiceNumberKey));
          expect(distinctKeys.size).toBe(40);

          const updated = await prisma.senderProfile.findUniqueOrThrow({
            where: { id: senderProfile.id },
          });
          expect(updated.invoiceCounter).toBe(senderProfile.invoiceCounter + 40);

          const invoiceCount = await prisma.invoice.count({ where: { senderProfileId: senderProfile.id } });
          expect(invoiceCount).toBe(40);
        } finally {
          await clientA.$disconnect();
          await clientB.$disconnect();
        }
      },
      60_000
    );
  }
);

describe.runIf(!containerRuntimeAvailable)('allocateInvoiceNumber (T12)', () => {
  it.skip('skipped: no container runtime', () => {});
});
