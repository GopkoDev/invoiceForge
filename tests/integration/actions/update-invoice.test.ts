// T14 (spec.md §5 AC-11, AC-17, AC-18) — updateInvoice rewritten on the six-step order (contract
// below), covering the profile-move allocator, the legacy shared-number and legacy-totals
// confirmation flows, and applyStatusChange from the editor, per
// docs/features/architecture-hardening/tasks/t14-update-invoice-move-and-legacy.md
// (Inlined context — contracts/server-actions.md §updateInvoice, ordered checks, verbatim; the
// legacy flag shape on getInvoiceEditorData/getInvoice; sad.md §6 flow 6 postcondition and §8 rows
// Invoice numbering / Status and paid date) and the test-plan.md rows for these ACs (below).
//
// test-plan.md rows exercised here:
//   - AC-11 "moving an invoice to another profile with an empty number uses the new profile's
//     sequence" (integration)
//   - AC-11 "moving with a typed number follows the manual rules in the new profile" (integration)
//   - AC-17 "legacy invoice with a different stored total asks for confirmation" (integration)
//   - AC-17 "legacy invoice whose amounts break the rules can't be saved until corrected"
//     (integration)
//   - AC-17 "legacy invoice with a shared number can be viewed but not saved until renumbered"
//     (integration)
//   - AC-17 "status change from the list skips legacy checks" is T-covered elsewhere
//     (updateInvoiceStatus already exists and is untouched by this task; not re-tested here)
//   - AC-18 "paid date is recorded from both the list and the editor" — editor half (integration)
//
// Assumed API/result shapes (task file §API contract + contracts/server-actions.md §updateInvoice,
// verbatim):
//   updateInvoice(id, data: InvoiceFormValues & { confirmedTotals? }): Promise<ActionResult<SavedInvoice>>
//   SavedInvoice = { id, invoiceNumber, subtotal, taxAmount, total, status, paidAt }
//   getInvoice(id) / getInvoiceEditorData(id).initialData gain a sibling `invoice.legacy` shape;
//   this suite reads it off getInvoice's ActionResult<SerializedInvoice> as `data.legacy`, the
//   simplest surface named in the contract slice ("data.invoice gains: legacy: {...} | null").
//
// Seams: same-process app code (tests/README.md option 1) — DATABASE_URL + vi.resetModules() +
// dynamic import, mock '@/auth' (same seam as create-and-duplicate-invoice.test.ts), stub
// 'next/cache', and mock '@sentry/nextjs' (imported by invoice-actions.ts even though this task
// doesn't newly exercise the P2002 backstop).
//
// RED (T14 not yet implemented): updateInvoice today (a) returns only `{ id }`, never the
// SavedInvoice shape (invoiceNumber/subtotal/taxAmount/total/status/paidAt) the contract requires;
// (b) on a profile move, calls generateInvoiceNumber (the no-lock, no-side-effect hint) instead of
// allocateInvoiceNumber under B's row lock, so B's invoiceCounter never advances; (c) never checks
// the legacy shared-number or legacy-totals cases at all, so it saves over both silently; (d)
// writes `status: validatedData.status` directly instead of running it through
// applyStatusChange, so paidAt is never set/cleared; (e) getInvoice/getInvoiceEditorData never
// compute a `legacy` flag.
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
import {
  createInvoice as seedInvoiceRow,
  createLegacyInvoice as seedLegacyInvoiceRow,
} from '../../support/factories/invoice';
import { computeInvoiceAmounts } from '@/lib/helpers/invoice-calculations';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

// --- mock '@/auth' so a test drives the session outcome directly (same seam as
// create-and-duplicate-invoice.test.ts). ---------------------------------------------------------
const authMock = vi.fn<() => Promise<{ user: { id: string } } | null>>();
vi.mock('@/auth', () => ({ auth: () => authMock() }));

// --- next/cache's revalidatePath needs a live request/static-generation store, which this
// same-process (non-served) import never has. Stubbed out, orthogonal to what this suite tests. -
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

// --- Sentry: invoice-actions.ts imports captureMessage at module load; stub so no real DSN/init
// is required. --------------------------------------------------------------------------------
vi.mock('@sentry/nextjs', () => ({ captureMessage: vi.fn() }));

type SavedInvoice = {
  id: string;
  invoiceNumber: string;
  subtotal: number;
  taxAmount: number;
  total: number;
  status: string;
  paidAt: string | null;
};
type ActionResult<T> =
  | { success: true; data: T }
  | {
      success: false;
      code: string;
      error: string;
      fieldErrors?: Record<string, string[]>;
      details?: unknown;
    };
type FormItem = {
  id: string;
  productId?: string;
  productName: string;
  description?: string;
  unit: string;
  quantity: number;
  price: number;
  total: number;
};
type FormValues = Record<string, unknown> & { items: FormItem[] };
type UpdateInvoice = (id: string, data: FormValues) => Promise<ActionResult<SavedInvoice>>;
type GetInvoice = (
  id: string
) => Promise<
  ActionResult<
    Record<string, unknown> & {
      legacy: { storedTotal: string; recomputedTotal: string; sharedNumber: boolean } | null;
    }
  >
>;
type FormatInvoiceNumber = (prefix: string, n: number) => string;
type NormalizeInvoiceNumber = (s: string) => string;

describe.runIf(containerRuntimeAvailable)(
  'updateInvoice (T14, AC-11, AC-17, AC-18)',
  () => {
    let db: TestDatabase;
    let prisma: PrismaClient;
    let updateInvoice: UpdateInvoice;
    let getInvoice: GetInvoice;
    let formatInvoiceNumber: FormatInvoiceNumber;
    let normalizeInvoiceNumber: NormalizeInvoiceNumber;

    beforeAll(async () => {
      db = await startTestDatabase();
      process.env.DATABASE_URL = db.connectionString;
      vi.resetModules();
      prisma = createTestPrismaClient(db.connectionString);
      ({ updateInvoice, getInvoice } = (await import(
        '@/lib/actions/invoice-actions/invoice-actions'
      )) as unknown as { updateInvoice: UpdateInvoice; getInvoice: GetInvoice });
      ({ formatInvoiceNumber, normalizeInvoiceNumber } = (await import(
        '@/lib/actions/invoice-actions/numbering'
      )) as unknown as {
        formatInvoiceNumber: FormatInvoiceNumber;
        normalizeInvoiceNumber: NormalizeInvoiceNumber;
      });
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

    async function seedOwner(overrides: { senderProfile?: Parameters<typeof createSenderProfile>[2] } = {}) {
      const freelancer = await createFreelancer(prisma);
      const senderProfile = await createSenderProfile(prisma, freelancer.id, overrides.senderProfile);
      const customer = await createCustomer(prisma, freelancer.id);
      const bankAccount = await createBankAccount(prisma, senderProfile.id);
      authMock.mockResolvedValue({ user: { id: freelancer.id } });
      return { freelancer, senderProfile, customer, bankAccount };
    }

    function items(overrides: Partial<FormItem>[] = [{}]): FormItem[] {
      return overrides.map((o, i) => ({
        id: `item-${i}`,
        productName: 'Widget',
        unit: 'pcs',
        quantity: 1,
        price: 100,
        total: 100,
        ...o,
      }));
    }

    function buildForm(
      owner: Awaited<ReturnType<typeof seedOwner>>,
      invoiceNumber: string,
      overrides: Partial<FormValues> = {}
    ): FormValues {
      return {
        invoiceNumber,
        status: 'DRAFT',
        senderProfileId: owner.senderProfile.id,
        bankAccountId: owner.bankAccount.id,
        customerId: owner.customer.id,
        issueDate: new Date(),
        dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        currency: 'USD',
        poNumber: '',
        paymentTerms: '',
        taxRate: 0,
        discount: 0,
        shipping: 0,
        notes: '',
        terms: '',
        items: items(),
        ...overrides,
      };
    }

    // --- Ordered checks (contract §updateInvoice, step 1): UNAUTHORIZED -> VALIDATION -> NOT_FOUND
    it('UNAUTHORIZED wins over every other check, even for a nonexistent invoice with bad data', async () => {
      authMock.mockResolvedValue(null);

      const result = await updateInvoice('does-not-exist', {
        items: items([{ price: -1 }]),
      } as unknown as FormValues);

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('UNAUTHORIZED');
    });

    it('VALIDATION (schema) wins over NOT_FOUND for an invoice that does not exist', async () => {
      const owner = await seedOwner();

      const result = await updateInvoice(
        'does-not-exist',
        buildForm(owner, 'INV-X', { items: items([{ price: -1 }]) })
      );

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('VALIDATION');
      expect(result.fieldErrors?.['items.0.price']).toContain("Price can't be negative.");
    });

    it('NOT_FOUND when the invoice does not belong to the caller', async () => {
      const owner = await seedOwner();
      const other = await createFreelancer(prisma);
      const otherProfile = await createSenderProfile(prisma, other.id);
      const otherCustomer = await createCustomer(prisma, other.id);
      const otherBankAccount = await createBankAccount(prisma, otherProfile.id);
      const foreignInvoice = await seedInvoiceRow(prisma, {
        senderProfile: otherProfile,
        customer: otherCustomer,
        bankAccount: otherBankAccount,
        overrides: { invoiceNumber: 'FOR-0001', invoiceNumberKey: normalizeInvoiceNumber('FOR-0001') },
      });

      const result = await updateInvoice(foreignInvoice.id, buildForm(owner, 'INV-X'));

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('NOT_FOUND');
    });

    // --- AC-11: move A -> B ------------------------------------------------------------------
    it('AC-11: move to B with an empty number allocates from B\'s sequence and leaves A\'s counter untouched', async () => {
      const owner = await seedOwner();
      const profileB = await createSenderProfile(prisma, owner.freelancer.id);
      const bankAccountB = await createBankAccount(prisma, profileB.id);
      const original = await seedInvoiceRow(prisma, {
        senderProfile: owner.senderProfile,
        customer: owner.customer,
        bankAccount: owner.bankAccount,
        overrides: { invoiceNumber: 'A-0001', invoiceNumberKey: normalizeInvoiceNumber('A-0001') },
      });
      const expectedNumber = formatInvoiceNumber(profileB.invoicePrefix, profileB.invoiceCounter + 1);

      const result = await updateInvoice(
        original.id,
        buildForm(owner, '', {
          senderProfileId: profileB.id,
          bankAccountId: bankAccountB.id,
        })
      );

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.invoiceNumber).toBe(expectedNumber);

      const updatedA = await prisma.senderProfile.findUniqueOrThrow({ where: { id: owner.senderProfile.id } });
      expect(updatedA.invoiceCounter).toBe(owner.senderProfile.invoiceCounter);
      const updatedB = await prisma.senderProfile.findUniqueOrThrow({ where: { id: profileB.id } });
      expect(updatedB.invoiceCounter).toBe(profileB.invoiceCounter + 1);

      const stored = await prisma.invoice.findUniqueOrThrow({ where: { id: original.id } });
      expect(stored.senderProfileId).toBe(profileB.id);
      expect(stored.invoiceNumber).toBe(expectedNumber);
    });

    it('AC-11: move to B typing A\'s old number, free in B, is kept as manual and B\'s counter does not move', async () => {
      const owner = await seedOwner();
      const profileB = await createSenderProfile(prisma, owner.freelancer.id);
      const bankAccountB = await createBankAccount(prisma, profileB.id);
      const original = await seedInvoiceRow(prisma, {
        senderProfile: owner.senderProfile,
        customer: owner.customer,
        bankAccount: owner.bankAccount,
        overrides: { invoiceNumber: 'A-0007', invoiceNumberKey: normalizeInvoiceNumber('A-0007') },
      });

      const result = await updateInvoice(
        original.id,
        buildForm(owner, 'A-0007', {
          senderProfileId: profileB.id,
          bankAccountId: bankAccountB.id,
        })
      );

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.invoiceNumber).toBe('A-0007');

      const updatedB = await prisma.senderProfile.findUniqueOrThrow({ where: { id: profileB.id } });
      expect(updatedB.invoiceCounter).toBe(profileB.invoiceCounter);

      const stored = await prisma.invoice.findUniqueOrThrow({ where: { id: original.id } });
      expect(stored.invoiceNumberKey).toBe(normalizeInvoiceNumber('A-0007'));
    });

    it('AC-11: move to B typing a number already taken in B is blocked with CONFLICT', async () => {
      const owner = await seedOwner();
      const profileB = await createSenderProfile(prisma, owner.freelancer.id);
      const bankAccountB = await createBankAccount(prisma, profileB.id);
      const customerB = owner.customer;
      await seedInvoiceRow(prisma, {
        senderProfile: profileB,
        customer: customerB,
        bankAccount: bankAccountB,
        overrides: { invoiceNumber: 'B-TAKEN', invoiceNumberKey: normalizeInvoiceNumber('B-TAKEN') },
      });
      const original = await seedInvoiceRow(prisma, {
        senderProfile: owner.senderProfile,
        customer: owner.customer,
        bankAccount: owner.bankAccount,
        overrides: { invoiceNumber: 'A-0001', invoiceNumberKey: normalizeInvoiceNumber('A-0001') },
      });

      const result = await updateInvoice(
        original.id,
        buildForm(owner, 'B-TAKEN', {
          senderProfileId: profileB.id,
          bankAccountId: bankAccountB.id,
        })
      );

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('CONFLICT');

      const stored = await prisma.invoice.findUniqueOrThrow({ where: { id: original.id } });
      expect(stored.senderProfileId).toBe(owner.senderProfile.id); // A untouched, nothing saved
    });

    // --- AC-17: legacy number (a shared number can't exist since T30's NOT NULL key) ------------
    it('AC-17: a legacy invoice renumbered to a free number is no longer blocked by the shared-number check', async () => {
      const owner = await seedOwner();
      const legacy = await seedLegacyInvoiceRow(prisma, {
        senderProfile: owner.senderProfile,
        customer: owner.customer,
        bankAccount: owner.bankAccount,
        items: [{ name: 'Legacy item', quantity: 1, rate: 100, amount: 100 }],
        overrides: { invoiceNumber: 'LEGACY-0002', total: 100 }, // stored total equal to recompute
      });

      const result = await updateInvoice(legacy.id, buildForm(owner, 'LEGACY-FRESH'));

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.invoiceNumber).toBe('LEGACY-FRESH');

      const stored = await prisma.invoice.findUniqueOrThrow({ where: { id: legacy.id } });
      expect(stored.invoiceNumberKey).toBe(normalizeInvoiceNumber('LEGACY-FRESH'));
    });

    // --- AC-17: legacy totals -------------------------------------------------------------------
    it('AC-17: a legacy invoice whose stored total disagrees with the recompute asks for confirmation and saves nothing', async () => {
      const owner = await seedOwner();
      const legacy = await seedLegacyInvoiceRow(prisma, {
        senderProfile: owner.senderProfile,
        customer: owner.customer,
        bankAccount: owner.bankAccount,
        items: [{ name: 'Legacy item', quantity: 1, rate: 120, amount: 120 }],
        overrides: { invoiceNumber: 'LEGACY-0003', subtotal: 120, total: 120.5 }, // stored 120.50, recompute 120.00
      });

      const result = await updateInvoice(
        legacy.id,
        buildForm(owner, 'LEGACY-0003-FRESH', { items: items([{ price: 120 }]) })
      );

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('CONFLICT');
      expect(result.error).toBe('The total of this invoice changes from 120.50 to 120.00. Confirm to save.');
      expect(result.details).toEqual({ kind: 'TOTALS_CHANGED', oldTotal: '120.50', newTotal: '120.00' });

      const stored = await prisma.invoice.findUniqueOrThrow({ where: { id: legacy.id } });
      expect(stored.invoiceNumber).toBe('LEGACY-0003'); // nothing saved
      expect(Number(stored.total)).toBe(120.5);
    });

    it('AC-17: resubmitting with stale confirmedTotals asks again with the fresh figures', async () => {
      const owner = await seedOwner();
      const legacy = await seedLegacyInvoiceRow(prisma, {
        senderProfile: owner.senderProfile,
        customer: owner.customer,
        bankAccount: owner.bankAccount,
        items: [{ name: 'Legacy item', quantity: 1, rate: 120, amount: 120 }],
        overrides: { invoiceNumber: 'LEGACY-0004', subtotal: 120, total: 120.5 },
      });

      const result = await updateInvoice(
        legacy.id,
        buildForm(owner, 'LEGACY-0004-FRESH', {
          items: items([{ price: 120 }]),
          confirmedTotals: { oldTotal: '999.00', newTotal: '888.00' }, // stale, doesn't match (stored, recomputed)
        })
      );

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('CONFLICT');
      expect(result.details).toEqual({ kind: 'TOTALS_CHANGED', oldTotal: '120.50', newTotal: '120.00' });
    });

    it('AC-17: resubmitting with matching confirmedTotals saves', async () => {
      const owner = await seedOwner();
      const legacy = await seedLegacyInvoiceRow(prisma, {
        senderProfile: owner.senderProfile,
        customer: owner.customer,
        bankAccount: owner.bankAccount,
        items: [{ name: 'Legacy item', quantity: 1, rate: 120, amount: 120 }],
        overrides: { invoiceNumber: 'LEGACY-0005', subtotal: 120, total: 120.5 },
      });

      const result = await updateInvoice(
        legacy.id,
        buildForm(owner, 'LEGACY-0005-FRESH', {
          items: items([{ price: 120 }]),
          confirmedTotals: { oldTotal: '120.50', newTotal: '120.00' },
        })
      );

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.total).toBe(120);

      const stored = await prisma.invoice.findUniqueOrThrow({ where: { id: legacy.id } });
      expect(Number(stored.total)).toBe(120);
      expect(stored.invoiceNumberKey).toBe(normalizeInvoiceNumber('LEGACY-0005-FRESH'));
    });

    it('AC-17: a legacy invoice whose amounts break the rules is VALIDATION, not CONFLICT, even with confirmedTotals', async () => {
      const owner = await seedOwner();
      const legacy = await seedLegacyInvoiceRow(prisma, {
        senderProfile: owner.senderProfile,
        customer: owner.customer,
        bankAccount: owner.bankAccount,
        items: [{ name: 'Legacy item', quantity: 1, rate: 120, amount: 120 }],
        overrides: { invoiceNumber: 'LEGACY-0006', subtotal: 120, total: 120.5 },
      });

      const result = await updateInvoice(
        legacy.id,
        buildForm(owner, 'LEGACY-0006-FRESH', {
          items: items([{ price: -1 }]),
          confirmedTotals: { oldTotal: '120.50', newTotal: '-1.00' },
        })
      );

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('VALIDATION');
      expect(result.fieldErrors?.['items.0.price']).toContain("Price can't be negative.");
    });

    // --- AC-18: paid date from the editor -------------------------------------------------------
    it('AC-18: entering PAID from another status via the editor sets paidAt to the save moment', async () => {
      const owner = await seedOwner();
      const invoice = await seedInvoiceRow(prisma, {
        senderProfile: owner.senderProfile,
        customer: owner.customer,
        bankAccount: owner.bankAccount,
        overrides: {
          invoiceNumber: 'PAY-0001',
          invoiceNumberKey: normalizeInvoiceNumber('PAY-0001'),
          status: 'PENDING',
          paidAt: null,
        },
      });

      const before = new Date();
      const result = await updateInvoice(
        invoice.id,
        buildForm(owner, 'PAY-0001', { status: 'PAID' })
      );
      const after = new Date();

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.status).toBe('PAID');
      expect(result.data.paidAt).not.toBeNull();
      const paidAt = new Date(result.data.paidAt as string);
      expect(paidAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(paidAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('AC-18: saving an already-PAID invoice again as PAID from the editor leaves paidAt unchanged', async () => {
      const owner = await seedOwner();
      const originalPaidAt = new Date('2026-01-01T00:00:00.000Z');
      const invoice = await seedInvoiceRow(prisma, {
        senderProfile: owner.senderProfile,
        customer: owner.customer,
        bankAccount: owner.bankAccount,
        overrides: {
          invoiceNumber: 'PAY-0002',
          invoiceNumberKey: normalizeInvoiceNumber('PAY-0002'),
          status: 'PAID',
          paidAt: originalPaidAt,
        },
      });

      const result = await updateInvoice(
        invoice.id,
        buildForm(owner, 'PAY-0002', { status: 'PAID' })
      );

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.paidAt).toBe(originalPaidAt.toISOString());

      const stored = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
      expect(stored.paidAt?.toISOString()).toBe(originalPaidAt.toISOString());
    });

    // --- amounts recomputed and stored, never the browser's -------------------------------------
    it('amounts are recomputed server-side on update; a tampered browser total is ignored', async () => {
      const owner = await seedOwner();
      const invoice = await seedInvoiceRow(prisma, {
        senderProfile: owner.senderProfile,
        customer: owner.customer,
        bankAccount: owner.bankAccount,
        overrides: { invoiceNumber: 'RECOMP-0001', invoiceNumberKey: normalizeInvoiceNumber('RECOMP-0001') },
      });
      // Price is 2dp (F-02: quantity/price are bound to 2 decimal places); only the browser-sent
      // `total` field is tampered here.
      const formItems = items([{ productName: 'A', quantity: 2, price: 5.01, total: 999999 }]);
      const expected = computeInvoiceAmounts({
        items: formItems.map((i) => ({ quantity: i.quantity, price: i.price })),
        discount: 0,
        shipping: 0,
        taxRate: 0,
      });

      const result = await updateInvoice(
        invoice.id,
        buildForm(owner, 'RECOMP-0001', { items: formItems })
      );

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.total).toBe(Number(expected.total));

      const stored = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
      expect(Number(stored.total)).toBe(Number(expected.total));
    });

    // --- getInvoice's legacy flag (contract §getInvoiceEditorData/getInvoice, verbatim) ----------
    it('getInvoice reports legacy: null for a normal invoice whose key is set and totals agree', async () => {
      const owner = await seedOwner();
      const invoice = await seedInvoiceRow(prisma, {
        senderProfile: owner.senderProfile,
        customer: owner.customer,
        bankAccount: owner.bankAccount,
        overrides: { invoiceNumber: 'NORMAL-0001', invoiceNumberKey: normalizeInvoiceNumber('NORMAL-0001') },
      });

      const result = await getInvoice(invoice.id);

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.legacy).toBeNull();
    });

    it('F-09: getInvoice reports legacy.sharedNumber false for a legacy row whose number is not actually shared, even though totals still differ', async () => {
      const owner = await seedOwner();
      const legacy = await seedLegacyInvoiceRow(prisma, {
        senderProfile: owner.senderProfile,
        customer: owner.customer,
        bankAccount: owner.bankAccount,
        items: [{ name: 'Legacy item', quantity: 1, rate: 120, amount: 120 }],
        overrides: { invoiceNumber: 'LEGACY-VIEW', subtotal: 120, total: 120.5 },
      });

      const result = await getInvoice(legacy.id);

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.legacy).toEqual({
        storedTotal: '120.50',
        recomputedTotal: '120.00',
        sharedNumber: false,
      });
    });

  }
);

describe.runIf(!containerRuntimeAvailable)('updateInvoice (T14)', () => {
  it.skip('skipped: no container runtime', () => {});
});
