// T17 (spec.md §5 AC-20) — add getAccountDeletionSummary and rewrite deleteUserAccount onto one
// explicit transaction that deletes the Freelancer's invoices first, then the User (cascading
// Account, Session, EmailHistory, SenderProfile -> BankAccount, Customer -> CustomPrice, Product
// and LogoFetchWindow), plus the account's VerificationToken rows (breakdown decision, OQ-2),
// with the Restrict FKs on Invoice.senderProfile/customer/bankAccount left untouched (ADR-0007),
// per docs/features/architecture-hardening/tasks/t17-account-deletion-transaction.md (Inlined
// context: adr/0007 Decision outcome, verbatim; contracts/server-actions.md §Account and profile,
// verbatim/abridged; data-model.md §Entities, Account deletion, abridged; sad.md §8/§2 Hard
// rules) and the test-plan.md rows for AC-20 (below).
//
// test-plan.md rows exercised here:
//   - AC-20 "deletion summary counts the invoices that will be lost" (integration)
//   - AC-20 "account deletion removes every data category" (integration)
//   - AC-20 "account deletion is all-or-nothing" (integration)
//   - AC-23 half: "settings actions without a session are refused before input is read" — the
//     UNAUTHORIZED branch of both actions here, no ACs skipped for it elsewhere in this task.
//
// Assumed API/result shapes (task file §API contract, verbatim; types/actions.ts ActionResult):
//   getAccountDeletionSummary(): Promise<ActionResult<{ invoiceCount: number }>>
//   deleteUserAccount(): Promise<ActionResult<void>>
//     FAILED message: "Your account couldn't be deleted. Nothing was removed." (task file, verbatim)
//
// Seams: same-process app code (tests/README.md option 1) — DATABASE_URL + vi.resetModules() +
// dynamic import, mock '@/auth' (same seam as create-and-duplicate-invoice.test.ts; also exposes
// a no-op `signOut` since account-actions.ts imports from the same module and the contract notes
// "success -> the client signs out", though that call is expected to live client-side per T18 and
// is not asserted here), stub 'next/cache' (no live request/static-generation store in this
// same-process import), and mock '@sentry/nextjs' so a FAILED path's alert is observable without
// a real Sentry DSN.
//
// RED (T17 not yet implemented): `lib/actions/account-actions.ts` today (a) has no
// `getAccountDeletionSummary` export at all; (b) `deleteUserAccount` returns `{ success, message
// | error }`, not `ActionResult` (no `code`), so `UNAUTHORIZED`/`FAILED` never appear; (c) relies
// solely on schema cascades from `prisma.user.delete`, which throws on the Restrict FKs on
// `Invoice.senderProfile/customer/bankAccount` for any Freelancer who has invoices, instead of
// deleting invoices first inside an explicit transaction; (d) never deletes `VerificationToken`
// rows for the account's email.
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../support/db/docker-availability';
import {
  startTestDatabase,
  type TestDatabase,
} from '../../support/db/container';
import { createTestPrismaClient } from '../../support/db/client';
import { truncateAllTables } from '../../support/db/truncate';
import { createFreelancer } from '../../support/factories/user';
import { createSenderProfile } from '../../support/factories/sender-profile';
import { createCustomer } from '../../support/factories/customer';
import { createBankAccount } from '../../support/factories/bank-account';
import { createProduct } from '../../support/factories/product';
import { createCustomPrice } from '../../support/factories/custom-price';
import { createInvoice as seedInvoiceRow } from '../../support/factories/invoice';
import { createLogoFetchWindow } from '../../support/factories/logo-fetch-window';
import { addressLimitKey } from '@/lib/security/limits/keys';
import {
  createLimitEvent,
  TEST_LIMIT_KEY_SECRET,
} from '../../support/factories/limit-event';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

// --- mock '@/auth' so a test drives the session outcome directly (same seam as
// create-and-duplicate-invoice.test.ts). Also exposes `signOut` in case account-actions.ts
// imports it alongside `auth` from the same module — not asserted on here (client-side per T18).
const authMock = vi.fn<() => Promise<{ user: { id: string } } | null>>();
const signOutMock = vi.fn();
vi.mock('@/auth', () => ({
  auth: () => authMock(),
  signOut: (...args: unknown[]) => signOutMock(...args),
}));

// --- next/cache's revalidatePath needs a live request/static-generation store, which this
// same-process (non-served) import never has. Stubbed out, orthogonal to what this suite tests. -
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

// --- Sentry: mocked so a FAILED path's alert (if any) is observable without a real DSN/init. ----
const captureMessageMock = vi.fn();
const captureExceptionMock = vi.fn();
vi.mock('@sentry/nextjs', () => ({
  captureMessage: (...args: unknown[]) => captureMessageMock(...args),
  captureException: (...args: unknown[]) => captureExceptionMock(...args),
}));

type ActionResult<T> =
  | { success: true; data: T }
  | {
      success: false;
      code: string;
      error: string;
      fieldErrors?: Record<string, string[]>;
    };
type GetAccountDeletionSummary = () => Promise<
  ActionResult<{ invoiceCount: number }>
>;
type DeleteUserAccount = () => Promise<ActionResult<void>>;

describe.runIf(containerRuntimeAvailable)(
  'getAccountDeletionSummary / deleteUserAccount (T17, AC-20)',
  () => {
    let db: TestDatabase;
    let prisma: PrismaClient;
    let getAccountDeletionSummary: GetAccountDeletionSummary;
    let deleteUserAccount: DeleteUserAccount;

    beforeAll(async () => {
      db = await startTestDatabase();
      process.env.DATABASE_URL = db.connectionString;
      vi.resetModules();
      prisma = createTestPrismaClient(db.connectionString);
      ({ getAccountDeletionSummary, deleteUserAccount } =
        (await import('@/lib/actions/account-actions')) as unknown as {
          getAccountDeletionSummary: GetAccountDeletionSummary;
          deleteUserAccount: DeleteUserAccount;
        });
    }, 60_000);

    afterAll(async () => {
      await prisma?.$disconnect();
      await db?.stop();
    });

    beforeEach(() => {
      authMock.mockReset();
      signOutMock.mockReset();
      captureMessageMock.mockReset();
      captureExceptionMock.mockReset();
    });

    afterEach(async () => {
      await truncateAllTables(prisma);
    });

    /** Seeds a full AC-20 data graph (two sender profiles) for one Freelancer. */
    async function seedFullAccount(emailSuffix: string) {
      const freelancer = await createFreelancer(prisma, {
        email: `owner-${emailSuffix}@example.com`,
      });
      const profileA = await createSenderProfile(prisma, freelancer.id, {
        isDefault: true,
      });
      const profileB = await createSenderProfile(prisma, freelancer.id, {
        isDefault: false,
      });
      const bankA = await createBankAccount(prisma, profileA.id);
      const bankB = await createBankAccount(prisma, profileB.id);
      const customer = await createCustomer(prisma, freelancer.id);
      const product = await createProduct(prisma, freelancer.id);
      await createCustomPrice(prisma, product.id, customer.id);
      await seedInvoiceRow(prisma, {
        senderProfile: profileA,
        customer,
        bankAccount: bankA,
      });
      await seedInvoiceRow(prisma, {
        senderProfile: profileB,
        customer,
        bankAccount: bankB,
      });
      await createLogoFetchWindow(prisma, { userId: freelancer.id });
      await prisma.account.create({
        data: {
          userId: freelancer.id,
          type: 'oauth',
          provider: 'google',
          providerAccountId: `google-${emailSuffix}`,
        },
      });
      await prisma.session.create({
        data: {
          userId: freelancer.id,
          sessionToken: `session-${emailSuffix}`,
          expires: new Date(Date.now() + 60_000),
        },
      });
      await prisma.emailHistory.create({
        data: {
          userId: freelancer.id,
          oldEmail: `old-${emailSuffix}@example.com`,
          newEmail: freelancer.email,
        },
      });
      await prisma.verificationToken.create({
        data: {
          identifier: freelancer.email,
          token: `token-${emailSuffix}`,
          expires: new Date(Date.now() + 60_000),
        },
      });
      return {
        freelancer,
        profileA,
        profileB,
        bankA,
        bankB,
        customer,
        product,
      };
    }

    async function rowCountsFor(userId: string, email: string) {
      return {
        user: await prisma.user.count({ where: { id: userId } }),
        account: await prisma.account.count({ where: { userId } }),
        session: await prisma.session.count({ where: { userId } }),
        emailHistory: await prisma.emailHistory.count({ where: { userId } }),
        senderProfile: await prisma.senderProfile.count({ where: { userId } }),
        bankAccount: await prisma.bankAccount.count({
          where: { senderProfile: { userId } },
        }),
        customer: await prisma.customer.count({ where: { userId } }),
        product: await prisma.product.count({ where: { userId } }),
        customPrice: await prisma.customPrice.count({
          where: { product: { userId } },
        }),
        invoice: await prisma.invoice.count({
          where: { senderProfile: { userId } },
        }),
        invoiceItem: await prisma.invoiceItem.count({
          where: { invoice: { senderProfile: { userId } } },
        }),
        logoFetchWindow: await prisma.logoFetchWindow.count({
          where: { userId },
        }),
        verificationToken: await prisma.verificationToken.count({
          where: { identifier: email },
        }),
      };
    }

    it("AC-20: getAccountDeletionSummary counts only the caller's invoices across all of their sender profiles", async () => {
      const owner = await seedFullAccount('summary-owner');
      const other = await seedFullAccount('summary-other');
      authMock.mockResolvedValue({ user: { id: owner.freelancer.id } });

      const result = await getAccountDeletionSummary();

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.invoiceCount).toBe(2); // one invoice per seeded sender profile, owner-only
      void other;
    });

    it('AC-20: getAccountDeletionSummary returns UNAUTHORIZED without a live session', async () => {
      authMock.mockResolvedValue(null);

      const result = await getAccountDeletionSummary();

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('UNAUTHORIZED');
    });

    it('AC-20: deleteUserAccount removes every data category for the account, in one transaction, and leaves other accounts untouched', async () => {
      const owner = await seedFullAccount('delete-owner');
      const other = await seedFullAccount('delete-other');
      authMock.mockResolvedValue({ user: { id: owner.freelancer.id } });

      const result = await deleteUserAccount();

      expect(result.success).toBe(true);

      const ownerCounts = await rowCountsFor(
        owner.freelancer.id,
        owner.freelancer.email
      );
      expect(ownerCounts).toEqual({
        user: 0,
        account: 0,
        session: 0,
        emailHistory: 0,
        senderProfile: 0,
        bankAccount: 0,
        customer: 0,
        product: 0,
        customPrice: 0,
        invoice: 0,
        invoiceItem: 0,
        logoFetchWindow: 0,
        verificationToken: 0,
      });

      const otherCounts = await rowCountsFor(
        other.freelancer.id,
        other.freelancer.email
      );
      expect(otherCounts).toEqual({
        user: 1,
        account: 1,
        session: 1,
        emailHistory: 1,
        senderProfile: 2,
        bankAccount: 2,
        customer: 1,
        product: 1,
        customPrice: 1,
        invoice: 2,
        invoiceItem: 2,
        logoFetchWindow: 1,
        verificationToken: 1,
      });
    });

    it('T13: deleteUserAccount removes EXPORT rows (cascade) and the SIGNIN_ADDRESS digest rows, leaves SIGNIN_SOURCE and other accounts', async () => {
      process.env.LIMIT_KEY_SECRET = TEST_LIMIT_KEY_SECRET;
      const owner = await seedFullAccount('limits-owner');
      const other = await seedFullAccount('limits-other');
      const addressKey = (email: string) => addressLimitKey(email);
      for (const f of [owner.freelancer, other.freelancer]) {
        await createLimitEvent(prisma, {
          scope: 'EXPORT',
          key: f.id,
          userId: f.id,
          outcome: 'STARTED',
        });
        await createLimitEvent(prisma, {
          scope: 'SIGNIN_ADDRESS',
          key: addressKey(f.email),
          outcome: 'SENT',
        });
      }
      await createLimitEvent(prisma, {
        scope: 'SIGNIN_SOURCE',
        outcome: 'REQUESTED',
      });
      authMock.mockResolvedValue({ user: { id: owner.freelancer.id } });

      const result = await deleteUserAccount();

      expect(result.success).toBe(true);
      expect(
        await prisma.limitEvent.count({
          where: { scope: 'EXPORT', key: owner.freelancer.id },
        })
      ).toBe(0);
      expect(
        await prisma.limitEvent.count({
          where: {
            scope: 'SIGNIN_ADDRESS',
            key: addressKey(owner.freelancer.email),
          },
        })
      ).toBe(0);
      expect(
        await prisma.limitEvent.count({ where: { scope: 'SIGNIN_SOURCE' } })
      ).toBe(1);
      expect(
        await prisma.limitEvent.count({
          where: { scope: 'EXPORT', key: other.freelancer.id },
        })
      ).toBe(1);
      expect(
        await prisma.limitEvent.count({
          where: {
            scope: 'SIGNIN_ADDRESS',
            key: addressKey(other.freelancer.email),
          },
        })
      ).toBe(1);
    });

    it('AC-20: deleteUserAccount returns UNAUTHORIZED without a live session, and deletes nothing', async () => {
      const owner = await seedFullAccount('unauth-owner');
      authMock.mockResolvedValue(null);

      const result = await deleteUserAccount();

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('UNAUTHORIZED');

      const counts = await rowCountsFor(
        owner.freelancer.id,
        owner.freelancer.email
      );
      expect(counts.user).toBe(1);
      expect(counts.invoice).toBe(2);
    });

    it('AC-20: a failure partway through the transaction rolls back everything — nothing is partially deleted', async () => {
      const owner = await seedFullAccount('rollback-owner');
      authMock.mockResolvedValue({ user: { id: owner.freelancer.id } });

      // Real fault injection on the live container: a BEFORE DELETE trigger on SenderProfile (part
      // of the User cascade, which runs *after* the invoice deleteMany in ADR-0007's order) that
      // raises for this account's rows only. If deleteUserAccount only wraps its statements loosely
      // (or the invoice delete commits on its own before the User cascade fails), the invoices
      // seeded above will already be gone by the time this assertion runs.
      await prisma.$executeRawUnsafe(`
        CREATE OR REPLACE FUNCTION t17_fail_on_marked_profile() RETURNS TRIGGER AS $$
        BEGIN
          IF OLD."userId" = '${owner.freelancer.id}' THEN
            RAISE EXCEPTION 'T17 forced mid-transaction failure';
          END IF;
          RETURN OLD;
        END;
        $$ LANGUAGE plpgsql;
      `);
      await prisma.$executeRawUnsafe(`
        CREATE TRIGGER t17_trg_fail_on_marked_profile
        BEFORE DELETE ON "SenderProfile"
        FOR EACH ROW EXECUTE FUNCTION t17_fail_on_marked_profile();
      `);

      try {
        const result = await deleteUserAccount();

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.code).toBe('FAILED');
        expect(result.error).toBe(
          "Your account couldn't be deleted. Nothing was removed."
        );

        const counts = await rowCountsFor(
          owner.freelancer.id,
          owner.freelancer.email
        );
        expect(counts).toEqual({
          user: 1,
          account: 1,
          session: 1,
          emailHistory: 1,
          senderProfile: 2,
          bankAccount: 2,
          customer: 1,
          product: 1,
          customPrice: 1,
          invoice: 2, // the invoice deleteMany must have rolled back too — same transaction
          invoiceItem: 2,
          logoFetchWindow: 1,
          verificationToken: 1,
        });
      } finally {
        await prisma.$executeRawUnsafe(
          `DROP TRIGGER IF EXISTS t17_trg_fail_on_marked_profile ON "SenderProfile"`
        );
        await prisma.$executeRawUnsafe(
          `DROP FUNCTION IF EXISTS t17_fail_on_marked_profile()`
        );
      }
    });
  }
);

describe.runIf(!containerRuntimeAvailable)(
  'getAccountDeletionSummary / deleteUserAccount (T17)',
  () => {
    it.skip('skipped: no container runtime', () => {});
  }
);
