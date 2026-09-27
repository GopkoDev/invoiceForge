// T26 (spec.md §5 AC-29) — a foreign record must be indistinguishable from a missing one.
// See docs/features/architecture-hardening/tasks/t26-page-outcome-routing.md.
//
// Inlined context (task file, table "Code | When | Page caller", verbatim): `NOT_FOUND` fires
// "the record doesn't exist or isn't the caller's, with an identical message (AC-29)".
// test-plan.md row "a foreign record is indistinguishable from a missing one" (AC-29,
// integration): "For an invoice, a customer and a sender profile, another Freelancer's id and a
// random id give identical NOT_FOUND results." Driven here as a real-loader, real-DB regression
// guard per the dispatch note ("ONE integration test per AC-29 through a real loader against the
// container DB").
//
// Seams: same-process app code, same pattern as
// tests/integration/actions/custom-price-validation-and-links.test.ts: DATABASE_URL +
// vi.resetModules() + dynamic import, mock '@/auth', stub 'next/cache'. Real throwaway Postgres
// container.
//
// This is a non-regression guard, not this task's primary RED: getCustomer/getSenderProfile
// already look up `{ id, userId }` (customer-actions.ts, sender-profile-actions.ts), so a
// foreign id already falls through to the same NOT_FOUND branch as a random id for those two.
// getInvoiceEditorData's invoice lookup is scoped the same way
// (`invoice.findFirst({ where: { id, senderProfile: { userId } } })`), so it also currently
// gives the same (data-shape) outcome for a foreign vs. a random invoiceId — asserted below via
// the same "no initialData" signal the page itself keys off, per
// app/(invoice-editor)/invoices/[id]/edit/page.tsx ("if (!result.data || !result.data.initialData)
// notFound();"). This task's routing fix (AC-28) is exercised separately, at the page level, in
// tests/component/page-outcome-routing.test.tsx.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../support/db/container';
import { createTestPrismaClient } from '../../support/db/client';
import { truncateAllTables } from '../../support/db/truncate';
import { createFreelancer } from '../../support/factories/user';
import { createCustomer } from '../../support/factories/customer';
import { createSenderProfile } from '../../support/factories/sender-profile';
import { createBankAccount } from '../../support/factories/bank-account';
import { createInvoice as seedInvoiceRow } from '../../support/factories/invoice';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

const authMock = vi.fn<() => Promise<{ user: { id: string } } | null>>();
vi.mock('@/auth', () => ({ auth: () => authMock() }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

const RANDOM_ID = 'clzzzzzzzzzzzzzzzzzzzzzz'; // well-formed, never seeded

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; code: string; error: string };

type GetCustomer = (id: string) => Promise<ActionResult<{ id: string }>>;
type GetSenderProfile = (id: string) => Promise<ActionResult<{ id: string }>>;
type GetInvoiceEditorData = (
  invoiceId?: string
) => Promise<ActionResult<{ initialData?: unknown }>>;

describe.runIf(containerRuntimeAvailable)(
  'foreign record vs random id — identical NOT_FOUND (T26, AC-29)',
  () => {
    let db: TestDatabase;
    let prisma: PrismaClient;
    let getCustomer: GetCustomer;
    let getSenderProfile: GetSenderProfile;
    let getInvoiceEditorData: GetInvoiceEditorData;

    beforeAll(async () => {
      db = await startTestDatabase();
      process.env.DATABASE_URL = db.connectionString;
      vi.resetModules();
      prisma = createTestPrismaClient(db.connectionString);
      ({ getCustomer } = (await import('@/lib/actions/customer-actions')) as unknown as {
        getCustomer: GetCustomer;
      });
      ({ getSenderProfile } = (await import(
        '@/lib/actions/sender-profile-actions'
      )) as unknown as { getSenderProfile: GetSenderProfile });
      ({ getInvoiceEditorData } = (await import(
        '@/lib/actions/invoice-actions/invoice-actions'
      )) as unknown as { getInvoiceEditorData: GetInvoiceEditorData });
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

    it('AC-29: a foreign customer id and a random id give identical NOT_FOUND', async () => {
      const owner = await createFreelancer(prisma, { email: 'ac29-owner-customer@example.com' });
      const stranger = await createFreelancer(prisma, {
        email: 'ac29-stranger-customer@example.com',
      });
      const foreignCustomer = await createCustomer(prisma, stranger.id, { name: 'Not mine' });
      authMock.mockResolvedValue({ user: { id: owner.id } });

      const foreignResult = await getCustomer(foreignCustomer.id);
      const randomResult = await getCustomer(RANDOM_ID);

      expect(foreignResult.success).toBe(false);
      expect(randomResult.success).toBe(false);
      if (foreignResult.success || randomResult.success) return;
      expect(foreignResult.code).toBe('NOT_FOUND');
      expect(randomResult.code).toBe('NOT_FOUND');
      expect(foreignResult.error).toBe(randomResult.error);
    });

    it('AC-29: a foreign sender profile id and a random id give identical NOT_FOUND', async () => {
      const owner = await createFreelancer(prisma, { email: 'ac29-owner-sp@example.com' });
      const stranger = await createFreelancer(prisma, { email: 'ac29-stranger-sp@example.com' });
      const foreignProfile = await createSenderProfile(prisma, stranger.id, {
        name: 'Not mine',
      });
      authMock.mockResolvedValue({ user: { id: owner.id } });

      const foreignResult = await getSenderProfile(foreignProfile.id);
      const randomResult = await getSenderProfile(RANDOM_ID);

      expect(foreignResult.success).toBe(false);
      expect(randomResult.success).toBe(false);
      if (foreignResult.success || randomResult.success) return;
      expect(foreignResult.code).toBe('NOT_FOUND');
      expect(randomResult.code).toBe('NOT_FOUND');
      expect(foreignResult.error).toBe(randomResult.error);
    });

    it('AC-29: a foreign invoice id and a random id give an identical (empty) editor result', async () => {
      const owner = await createFreelancer(prisma, { email: 'ac29-owner-invoice@example.com' });
      const stranger = await createFreelancer(prisma, {
        email: 'ac29-stranger-invoice@example.com',
      });
      const strangerProfile = await createSenderProfile(prisma, stranger.id);
      const strangerCustomer = await createCustomer(prisma, stranger.id);
      const strangerBankAccount = await createBankAccount(prisma, strangerProfile.id);
      const foreignInvoice = await seedInvoiceRow(prisma, {
        senderProfile: strangerProfile,
        customer: strangerCustomer,
        bankAccount: strangerBankAccount,
      });
      authMock.mockResolvedValue({ user: { id: owner.id } });

      const foreignResult = await getInvoiceEditorData(foreignInvoice.id);
      const randomResult = await getInvoiceEditorData(RANDOM_ID);

      expect(foreignResult.success).toBe(true);
      expect(randomResult.success).toBe(true);
      if (!foreignResult.success || !randomResult.success) return;
      // Same signal the page itself keys off (`!result.data.initialData` -> notFound()).
      expect(foreignResult.data.initialData).toBeUndefined();
      expect(randomResult.data.initialData).toBeUndefined();
    });
  }
);
