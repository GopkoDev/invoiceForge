// T13 (spec.md §5 AC-06..AC-10, AC-12..AC-15) — createInvoice and duplicateInvoice rewritten
// onto allocateInvoiceNumber (T12) and computeInvoiceAmounts (T10), with amounts recomputed
// server-side and client-sent totals ignored (ADR-0006), per
// docs/features/architecture-hardening/tasks/t13-create-and-duplicate-invoice.md
// (Inlined context — contracts/server-actions.md §createInvoice / §duplicateInvoice / §Invoices
// stored amounts, verbatim; sad.md §8 rows Invoice numbering / Money / Authorization; Checklist;
// Edge cases table) and the test-plan.md rows for these ACs (below).
//
// test-plan.md rows exercised here:
//   - AC-06 "saving with an empty number assigns the next number and advances the sequence" (integration)
//   - AC-07 "two concurrent saves with empty numbers both succeed with different numbers" (integration,
//     small case here — the 20-iteration race lives in T12's allocate-invoice-number.test.ts)
//   - AC-08 "manual number already used in the profile is blocked" (integration)
//   - AC-09 "proposed number already taken manually is skipped" (integration)
//   - AC-10 "free manual number is kept and the sequence does not move" (integration)
//   - AC-12 "duplicate gets a number from its profile's sequence" (integration)
//   - AC-13 "browser-sent totals are replaced by recomputed ones without blocking" (integration)
//   - AC-14 "save with an out-of-bounds amount is blocked with field errors" (integration)
//   - AC-15 discount above subtotal plus shipping is rejected (covered at unit level in T11;
//     exercised once more here at the action level since createInvoice is what actually runs the
//     schema)
//
// Assumed API/result shapes (task file §API contract, verbatim):
//   createInvoice(data: InvoiceFormValues): Promise<ActionResult<SavedInvoice>>
//     SavedInvoice = { id, invoiceNumber, subtotal, taxAmount, total, status, paidAt }
//   duplicateInvoice(id): Promise<ActionResult<{ id; invoiceNumber }>>
//
// Seams: same-process app code (tests/README.md option 1) — DATABASE_URL + vi.resetModules() +
// dynamic import, mock '@/auth' (same seam as update-invoice-status.test.ts), stub 'next/cache'
// (no live request/static-generation store in this same-process import), and mock
// '@sentry/nextjs' so the "P2002 despite the lock" backstop's alert (checklist:
// `Sentry.captureMessage('invoice_number_conflict', …)`) is observable without a real Sentry DSN.
//
// RED (T13 not yet implemented): createInvoice today (a) always uses validatedData.invoiceNumber
// verbatim — an empty field is inserted as the literal empty string, never allocated via
// allocateInvoiceNumber, so it never advances invoiceCounter or picks a formatted number; (b)
// never writes invoiceNumberKey, so the "manual number already used" and "P2002 despite the lock"
// paths can't be reached the way the contract describes; (c) computes amounts via the thin
// calculateInvoiceTotals adapter, which sums the browser-sent items[].total rather than
// recomputing from quantity x price, so a tampered total is stored verbatim, not ignored; (d)
// duplicateInvoice hand-rolls its own `${prefix}-${year}-${counter+1}` number instead of calling
// the allocator, so it doesn't skip manually-taken numbers.
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
import { computeInvoiceAmounts } from '@/lib/helpers/invoice-calculations';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

// --- mock '@/auth' so a test drives the session outcome directly (same seam as
// update-invoice-status.test.ts / convert-image.test.ts). ---------------------------------------
const authMock = vi.fn<() => Promise<{ user: { id: string } } | null>>();
vi.mock('@/auth', () => ({ auth: () => authMock() }));

// --- next/cache's revalidatePath needs a live request/static-generation store, which this
// same-process (non-served) import never has. Stubbed out, orthogonal to what this suite tests. -
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

// --- Sentry: the "P2002 despite the lock" backstop (checklist) alerts via
// Sentry.captureMessage('invoice_number_conflict', ...). Mocked so the test can observe the call
// without a real DSN/init. ------------------------------------------------------------------------
const captureMessageMock = vi.fn();
vi.mock('@sentry/nextjs', () => ({ captureMessage: (...args: unknown[]) => captureMessageMock(...args) }));

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
  | { success: false; code: string; error: string; fieldErrors?: Record<string, string[]> };
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
type CreateInvoice = (data: FormValues) => Promise<ActionResult<SavedInvoice>>;
type DuplicateInvoice = (id: string) => Promise<ActionResult<{ id: string; invoiceNumber: string }>>;
type GetInvoice = (id: string) => Promise<ActionResult<{ legacy: unknown }>>;
type FormatInvoiceNumber = (prefix: string, n: number) => string;
type NormalizeInvoiceNumber = (s: string) => string;
type PeekNextInvoiceNumber = (senderProfileId: string) => Promise<string | null>;

describe.runIf(containerRuntimeAvailable)(
  'createInvoice / duplicateInvoice (T13, AC-06..AC-10, AC-12..AC-15)',
  () => {
    let db: TestDatabase;
    let prisma: PrismaClient;
    let createInvoice: CreateInvoice;
    let duplicateInvoice: DuplicateInvoice;
    let getInvoice: GetInvoice;
    let formatInvoiceNumber: FormatInvoiceNumber;
    let normalizeInvoiceNumber: NormalizeInvoiceNumber;
    let peekNextInvoiceNumber: PeekNextInvoiceNumber;

    beforeAll(async () => {
      db = await startTestDatabase();
      process.env.DATABASE_URL = db.connectionString;
      vi.resetModules();
      prisma = createTestPrismaClient(db.connectionString);
      ({ createInvoice, duplicateInvoice, getInvoice } = (await import(
        '@/lib/actions/invoice-actions/invoice-actions'
      )) as unknown as { createInvoice: CreateInvoice; duplicateInvoice: DuplicateInvoice; getInvoice: GetInvoice });
      ({ formatInvoiceNumber, normalizeInvoiceNumber, peekNextInvoiceNumber } = (await import(
        '@/lib/actions/invoice-actions/numbering'
      )) as unknown as {
        formatInvoiceNumber: FormatInvoiceNumber;
        normalizeInvoiceNumber: NormalizeInvoiceNumber;
        peekNextInvoiceNumber: PeekNextInvoiceNumber;
      });
    }, 60_000);

    afterAll(async () => {
      await prisma?.$disconnect();
      await db?.stop();
    });

    beforeEach(() => {
      authMock.mockReset();
      captureMessageMock.mockReset();
    });

    afterEach(async () => {
      await truncateAllTables(prisma);
    });

    async function seedOwner() {
      const freelancer = await createFreelancer(prisma);
      const senderProfile = await createSenderProfile(prisma, freelancer.id);
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
      overrides: Partial<FormValues> = {}
    ): FormValues {
      return {
        invoiceNumber: '',
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

    it('AC-06: empty number assigns the profile\'s next formatted number and advances invoiceCounter by 1', async () => {
      const owner = await seedOwner();
      const expected = formatInvoiceNumber(owner.senderProfile.invoicePrefix, owner.senderProfile.invoiceCounter + 1);

      const result = await createInvoice(buildForm(owner));

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.invoiceNumber).toBe(expected);

      const updatedProfile = await prisma.senderProfile.findUniqueOrThrow({ where: { id: owner.senderProfile.id } });
      expect(updatedProfile.invoiceCounter).toBe(owner.senderProfile.invoiceCounter + 1);

      const stored = await prisma.invoice.findUniqueOrThrow({ where: { id: result.data.id } });
      expect(stored.invoiceNumber).toBe(expected);
      expect(stored.invoiceNumberKey).toBe(normalizeInvoiceNumber(expected));
    });

    it('AC-07: two concurrent empty-number saves under the same profile both succeed with distinct numbers', async () => {
      const owner = await seedOwner();

      const [a, b] = await Promise.all([
        createInvoice(buildForm(owner)),
        createInvoice(buildForm(owner)),
      ]);

      expect(a.success).toBe(true);
      expect(b.success).toBe(true);
      if (!a.success || !b.success) return;
      expect(a.data.invoiceNumber).not.toBe(b.data.invoiceNumber);

      const updatedProfile = await prisma.senderProfile.findUniqueOrThrow({ where: { id: owner.senderProfile.id } });
      expect(updatedProfile.invoiceCounter).toBe(owner.senderProfile.invoiceCounter + 2);
    });

    it('AC-08: a manually typed number colliding after normalization is blocked with CONFLICT, and nothing is saved', async () => {
      const owner = await seedOwner();
      await seedInvoiceRow(prisma, {
        senderProfile: owner.senderProfile,
        customer: owner.customer,
        bankAccount: owner.bankAccount,
        overrides: { invoiceNumber: ' inv-001 ', invoiceNumberKey: normalizeInvoiceNumber(' inv-001 ') },
      });

      const result = await createInvoice(buildForm(owner, { invoiceNumber: 'INV-001' }));

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('CONFLICT');
      expect(result.error).toBe('This invoice number is already used in this sender profile.');
      expect(result.fieldErrors?.invoiceNumber).toContain(
        'This invoice number is already used in this sender profile.'
      );

      const updatedProfile = await prisma.senderProfile.findUniqueOrThrow({ where: { id: owner.senderProfile.id } });
      expect(updatedProfile.invoiceCounter).toBe(owner.senderProfile.invoiceCounter);

      const invoiceCount = await prisma.invoice.count({ where: { senderProfileId: owner.senderProfile.id } });
      expect(invoiceCount).toBe(1); // only the pre-seeded row; nothing new was saved
    });

    it('AC-09: a manually taken proposed number is skipped and the sequence advances past it', async () => {
      const owner = await seedOwner();
      const taken = formatInvoiceNumber(owner.senderProfile.invoicePrefix, owner.senderProfile.invoiceCounter + 1);
      await seedInvoiceRow(prisma, {
        senderProfile: owner.senderProfile,
        customer: owner.customer,
        bankAccount: owner.bankAccount,
        overrides: { invoiceNumber: taken, invoiceNumberKey: normalizeInvoiceNumber(taken) },
      });

      const result = await createInvoice(buildForm(owner));

      expect(result.success).toBe(true);
      if (!result.success) return;
      const expected = formatInvoiceNumber(owner.senderProfile.invoicePrefix, owner.senderProfile.invoiceCounter + 2);
      expect(result.data.invoiceNumber).toBe(expected);

      const updatedProfile = await prisma.senderProfile.findUniqueOrThrow({ where: { id: owner.senderProfile.id } });
      expect(updatedProfile.invoiceCounter).toBe(owner.senderProfile.invoiceCounter + 2);
    });

    it('AC-10: a manual number equal to the hint, still free, is kept and the sequence does not move', async () => {
      const owner = await seedOwner();
      const hint = await peekNextInvoiceNumber(owner.senderProfile.id);
      expect(hint).not.toBeNull();

      const result = await createInvoice(buildForm(owner, { invoiceNumber: hint as string }));

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.invoiceNumber).toBe(hint);

      const updatedProfile = await prisma.senderProfile.findUniqueOrThrow({ where: { id: owner.senderProfile.id } });
      expect(updatedProfile.invoiceCounter).toBe(owner.senderProfile.invoiceCounter);
    });

    it('AC-13: stored amounts are recomputed from quantity x price; a tampered browser total is ignored and the save is not blocked', async () => {
      const owner = await seedOwner();
      // Prices are 2dp (F-02: quantity/price are bound to 2 decimal places), so only the
      // browser-sent `total` field is tampered here; half-up rounding of a >2dp product is
      // covered directly at the unit level (tests/unit/invoice-calculations.test.ts).
      const formItems = items([
        { productName: 'A', quantity: 1, price: 2.68, total: 999 }, // tampered total
        { productName: 'B', quantity: 2, price: 5.01, total: -1 }, // tampered total
      ]);
      const expected = computeInvoiceAmounts({
        items: formItems.map((i) => ({ quantity: i.quantity, price: i.price })),
        discount: 0,
        shipping: 0,
        taxRate: 10,
      });

      const result = await createInvoice(buildForm(owner, { items: formItems, taxRate: 10 }));

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.subtotal).toBe(Number(expected.subtotal));
      expect(result.data.taxAmount).toBe(Number(expected.taxAmount));
      expect(result.data.total).toBe(Number(expected.total));

      const stored = await prisma.invoice.findUniqueOrThrow({
        where: { id: result.data.id },
        include: { items: true },
      });
      expect(Number(stored.subtotal)).toBe(Number(expected.subtotal));
      expect(Number(stored.total)).toBe(Number(expected.total));
      expect(stored.items.map((i) => Number(i.amount)).sort()).toEqual(
        expected.items.map((i) => Number(i.amount)).sort()
      );
    });

    it('AC-14: a negative price is rejected as VALIDATION with a field message, and nothing is saved', async () => {
      const owner = await seedOwner();

      const result = await createInvoice(buildForm(owner, { items: items([{ price: -0.01 }]) }));

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('VALIDATION');
      expect(result.fieldErrors?.['items.0.price']).toContain("Price can't be negative.");

      const invoiceCount = await prisma.invoice.count({ where: { senderProfileId: owner.senderProfile.id } });
      expect(invoiceCount).toBe(0);
    });

    it('AC-15: a discount larger than subtotal plus shipping is rejected as VALIDATION, nothing saved', async () => {
      const owner = await seedOwner();

      const result = await createInvoice(buildForm(owner, { discount: 200.01, shipping: 0 }));

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('VALIDATION');
      expect(result.fieldErrors?.discount).toContain("Discount can't exceed the subtotal plus shipping.");

      const invoiceCount = await prisma.invoice.count({ where: { senderProfileId: owner.senderProfile.id } });
      expect(invoiceCount).toBe(0);
    });

    it('NOT_FOUND: a sender profile that belongs to another user is treated as missing', async () => {
      const owner = await seedOwner();
      const other = await createFreelancer(prisma);
      const foreignProfile = await createSenderProfile(prisma, other.id);

      const result = await createInvoice(buildForm(owner, { senderProfileId: foreignProfile.id }));

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('NOT_FOUND');

      const invoiceCount = await prisma.invoice.count({ where: { senderProfileId: foreignProfile.id } });
      expect(invoiceCount).toBe(0);
    });

    it('CONFLICT (P2002 backstop): a unique violation past the lock is reported as CONFLICT and alerts Sentry when the number was system-assigned', async () => {
      const owner = await seedOwner();
      const candidate = formatInvoiceNumber(owner.senderProfile.invoicePrefix, owner.senderProfile.invoiceCounter + 1);
      // Exact-text legacy duplicate with a NULL key: invisible to the allocator's key check
      // (isInvoiceKeyTaken), but the exact-match unique on [senderProfileId, invoiceNumber]
      // still rejects the insert (same setup as T12's allocate-invoice-number.test.ts).
      await seedInvoiceRow(prisma, {
        senderProfile: owner.senderProfile,
        customer: owner.customer,
        bankAccount: owner.bankAccount,
        overrides: { invoiceNumber: candidate, invoiceNumberKey: null },
      });

      const result = await createInvoice(buildForm(owner));

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('CONFLICT');
      expect(result.error).toBe('This invoice number is already used in this sender profile.');
      expect(captureMessageMock).toHaveBeenCalledWith(
        'invoice_number_conflict',
        expect.anything()
      );

      const updatedProfile = await prisma.senderProfile.findUniqueOrThrow({ where: { id: owner.senderProfile.id } });
      expect(updatedProfile.invoiceCounter).toBe(owner.senderProfile.invoiceCounter);
    });

    it('AC-12: a duplicate gets a fresh allocated number, DRAFT status, no paidAt, and recomputed amounts', async () => {
      const owner = await seedOwner();
      const original = await seedInvoiceRow(prisma, {
        senderProfile: owner.senderProfile,
        customer: owner.customer,
        bankAccount: owner.bankAccount,
        items: [{ name: 'Original item', quantity: 1, rate: 2.675, amount: 999 }], // deliberately wrong stored amount
        overrides: {
          status: 'PAID',
          paidAt: new Date('2026-01-01T00:00:00.000Z'),
          subtotal: 999,
          total: 999,
        },
      });
      const expectedNumber = formatInvoiceNumber(owner.senderProfile.invoicePrefix, owner.senderProfile.invoiceCounter + 1);

      const result = await duplicateInvoice(original.id);

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.invoiceNumber).toBe(expectedNumber);
      expect(result.data.id).not.toBe(original.id);

      const copy = await prisma.invoice.findUniqueOrThrow({
        where: { id: result.data.id },
        include: { items: true },
      });
      expect(copy.status).toBe('DRAFT');
      expect(copy.paidAt).toBeNull();
      expect(copy.invoiceNumber).toBe(expectedNumber);
      expect(copy.invoiceNumberKey).toBe(normalizeInvoiceNumber(expectedNumber));
      // recomputed from quantity x price (2.675 -> 2.68), not the original's wrong stored 999.
      expect(Number(copy.subtotal)).toBe(2.68);
      expect(Number(copy.total)).toBe(2.68);

      const updatedProfile = await prisma.senderProfile.findUniqueOrThrow({ where: { id: owner.senderProfile.id } });
      expect(updatedProfile.invoiceCounter).toBe(owner.senderProfile.invoiceCounter + 1);

      // the source invoice is unchanged.
      const untouchedOriginal = await prisma.invoice.findUniqueOrThrow({ where: { id: original.id } });
      expect(untouchedOriginal.status).toBe('PAID');
      expect(Number(untouchedOriginal.total)).toBe(999);
    });

    // F-02 regression (T32): quantity/price/taxRate/discount/shipping used to be unbound on
    // decimal places, so a value with 3+ decimals could be stored differently by the DECIMAL(_,2)
    // column than what was used to compute the total, flagging a brand-new invoice as legacy on
    // its very next load. With the 2dp bound enforced at the schema, a freshly created invoice
    // must reopen with legacy === null.
    it('F-02: a freshly created invoice reopens with legacy === null', async () => {
      const owner = await seedOwner();
      const formItems = items([{ productName: 'A', quantity: 1.01, price: 2.01, total: 0 }]);

      const result = await createInvoice(
        buildForm(owner, { items: formItems, taxRate: 10.01, discount: 1.01, shipping: 1.01 })
      );

      expect(result.success).toBe(true);
      if (!result.success) return;

      const reopened = await getInvoice(result.data.id);
      expect(reopened.success).toBe(true);
      if (!reopened.success) return;
      expect(reopened.data.legacy).toBeNull();
    });

    // F-05 (T32): duplicateInvoice recomputed amounts from the source invoice's stored
    // quantity/rate but never validated them, so a legacy invoice whose stored rate is negative
    // (broke the rules before this feature existed) produced a new, equally invalid copy instead
    // of being blocked.
    it('F-05: duplicating a legacy invoice with a rule-breaking amount is rejected as VALIDATION, and nothing is saved', async () => {
      const owner = await seedOwner();
      const original = await seedInvoiceRow(prisma, {
        senderProfile: owner.senderProfile,
        customer: owner.customer,
        bankAccount: owner.bankAccount,
        items: [{ name: 'Legacy item', quantity: 1, rate: -5, amount: -5 }],
        overrides: { subtotal: -5, total: -5 },
      });

      const before = await prisma.invoice.count({ where: { senderProfileId: owner.senderProfile.id } });

      const result = await duplicateInvoice(original.id);

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('VALIDATION');
      expect(result.fieldErrors?.['items.0.price']).toContain("Price can't be negative.");

      const after = await prisma.invoice.count({ where: { senderProfileId: owner.senderProfile.id } });
      expect(after).toBe(before);
    });

    it('duplicateInvoice NOT_FOUND: an invoice belonging to another user is treated as missing', async () => {
      const owner = await seedOwner();
      const other = await createFreelancer(prisma);
      const otherProfile = await createSenderProfile(prisma, other.id);
      const otherCustomer = await createCustomer(prisma, other.id);
      const otherBankAccount = await createBankAccount(prisma, otherProfile.id);
      const foreignInvoice = await seedInvoiceRow(prisma, {
        senderProfile: otherProfile,
        customer: otherCustomer,
        bankAccount: otherBankAccount,
      });

      authMock.mockResolvedValue({ user: { id: owner.freelancer.id } });
      const result = await duplicateInvoice(foreignInvoice.id);

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('NOT_FOUND');
    });
  }
);

describe.runIf(!containerRuntimeAvailable)('createInvoice / duplicateInvoice (T13)', () => {
  it.skip('skipped: no container runtime', () => {});
});
