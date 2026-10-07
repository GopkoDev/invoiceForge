// T11 (spec.md §5 AC-18, AC-19) — updateInvoiceStatus (list branch, Flow 8) rewritten onto
// applyStatusChange: guard -> z.nativeEnum(InvoiceStatus) -> scoped load -> applyStatusChange ->
// update only status/paidAt (contracts/server-actions.md §updateInvoiceStatus, verbatim; task
// checklist).
//
// test-plan.md rows exercised here:
//   - AC-18 "paid date is recorded from both the list and the editor" (integration; the list
//     half only - the editor half is T13/T14's create/update rewrite, out of T11's scope)
//   - AC-19 (action-level half of "an unknown status is rejected with a plain-language message":
//     VALIDATION with fieldErrors, nothing saved)
//   - AC-17 last sentence, edge case row "List status change on a legacy invoice with bad
//     totals" (task file Edge cases table): the status action never runs the amount/number/
//     legacy checks.
//
// Seams: same-process app code (tests/README.md option 1) - point `@/prisma` at the container via
// DATABASE_URL + vi.resetModules() + dynamic import, and mock '@/auth' the way
// tests/integration/api/convert-image.test.ts does, since updateInvoiceStatus calls
// getAuthenticatedUser() -> auth() from '@/auth'.
//
// RED (T11 not yet implemented): updateInvoiceStatus today (a) never validates `status` against
// the enum at runtime (a non-enum string is written straight to the database), (b) returns a bare
// `ActionResult<void>`, not `ActionResult<{ status; paidAt }>`, and (c) never clears `paidAt`
// when leaving PAID.
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
import { createInvoice } from '../../support/factories/invoice';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

// --- mock '@/auth' so a test drives the session outcome directly (same seam as convert-image). -
const authMock = vi.fn<() => Promise<{ user: { id: string } } | null>>();
vi.mock('@/auth', () => ({ auth: () => authMock() }));

// --- next/cache's revalidatePath needs a live request/static-generation store, which this
// same-process (non-served) import never has. It is a side effect orthogonal to what this suite
// is testing (the status/paidAt transition), so it is stubbed out here, the same way '@/auth' is
// swapped for a controllable seam above.
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

type UpdateInvoiceStatus = (
  id: string,
  status: string
) => Promise<
  | { success: true; data: { status: string; paidAt: string | null } }
  | { success: false; code: string; error: string; fieldErrors?: Record<string, string[]> }
>;

describe.runIf(containerRuntimeAvailable)(
  'updateInvoiceStatus (T11, AC-18, AC-19)',
  () => {
    let db: TestDatabase;
    let prisma: PrismaClient;
    let updateInvoiceStatus: UpdateInvoiceStatus;

    beforeAll(async () => {
      db = await startTestDatabase();
      process.env.DATABASE_URL = db.connectionString;
      vi.resetModules();
      prisma = createTestPrismaClient(db.connectionString);
      ({ updateInvoiceStatus } = (await import(
        '@/lib/actions/invoice-actions/invoice-actions'
      )) as unknown as { updateInvoiceStatus: UpdateInvoiceStatus });
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

    async function seedInvoice(overrides: Parameters<typeof createInvoice>[1]['overrides'] = {}) {
      const freelancer = await createFreelancer(prisma);
      const senderProfile = await createSenderProfile(prisma, freelancer.id);
      const customer = await createCustomer(prisma, freelancer.id);
      const bankAccount = await createBankAccount(prisma, senderProfile.id);
      const invoice = await createInvoice(prisma, {
        senderProfile,
        customer,
        bankAccount,
        overrides,
      });
      authMock.mockResolvedValue({ user: { id: freelancer.id } });
      return invoice;
    }

    // invoice-integrity T10 (AC-04): DRAFT -> PAID is no longer a move; the paid date is recorded on
    // PENDING -> PAID.
    it('AC-18: PENDING -> PAID sets paidAt to the moment of the change and returns it', async () => {
      const invoice = await seedInvoice({ status: 'PENDING', paidAt: null });
      const before = new Date();

      const result = await updateInvoiceStatus(invoice.id, 'PAID');

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.status).toBe('PAID');
      expect(result.data.paidAt).not.toBeNull();
      expect(new Date(result.data.paidAt as string).getTime()).toBeGreaterThanOrEqual(before.getTime());

      const stored = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
      expect(stored.status).toBe('PAID');
      expect(stored.paidAt).not.toBeNull();
    });

    it('AC-18: re-saving an already-PAID invoice as PAID from the list leaves paidAt unchanged', async () => {
      const paidAt = new Date('2026-01-01T00:00:00.000Z');
      const invoice = await seedInvoice({ status: 'PAID', paidAt });

      const result = await updateInvoiceStatus(invoice.id, 'PAID');

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(new Date(result.data.paidAt as string).getTime()).toBe(paidAt.getTime());

      const stored = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
      expect(stored.paidAt?.getTime()).toBe(paidAt.getTime());
    });

    it('AC-19: PAID -> PENDING clears paidAt', async () => {
      const paidAt = new Date('2026-01-01T00:00:00.000Z');
      const invoice = await seedInvoice({ status: 'PAID', paidAt });

      const result = await updateInvoiceStatus(invoice.id, 'PENDING');

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.status).toBe('PENDING');
      expect(result.data.paidAt).toBeNull();

      const stored = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
      expect(stored.status).toBe('PENDING');
      expect(stored.paidAt).toBeNull();
    });

    it('AC-19: a tampered status is rejected as VALIDATION with "Unknown status." and nothing is saved', async () => {
      const invoice = await seedInvoice({ status: 'DRAFT', paidAt: null });

      const result = await updateInvoiceStatus(invoice.id, 'FOO');

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('VALIDATION');
      expect(result.fieldErrors?.status).toContain('Unknown status.');

      const stored = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
      expect(stored.status).toBe('DRAFT');
      expect(stored.paidAt).toBeNull();
    });

    it('AC-17 last sentence (edge case): a status change on a legacy invoice with a bad stored total succeeds and leaves amounts and number untouched', async () => {
      const invoice = await seedInvoice({
        status: 'PENDING', // invoice-integrity T10: an issued invoice (DRAFT -> PAID is not a move)
        paidAt: null,
        subtotal: 100,
        total: 999, // deliberately wrong vs a fresh recompute of the seeded item (100)
        invoiceNumber: 'LEGACY-0001',
      });

      const result = await updateInvoiceStatus(invoice.id, 'PAID');

      expect(result.success).toBe(true);

      const stored = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
      expect(stored.status).toBe('PAID');
      expect(Number(stored.total)).toBe(999);
      expect(stored.invoiceNumber).toBe('LEGACY-0001');
    });

    // ---- invoice-integrity T10 (AC-04, AC-05, AC-06, AC-10, AC-14, AC-23) ----------------------
    const ALLOWED: Array<[string, string]> = [
      ['PENDING', 'PAID'],
      ['PENDING', 'OVERDUE'],
      ['PENDING', 'CANCELLED'],
      ['OVERDUE', 'PAID'],
      ['OVERDUE', 'CANCELLED'],
      ['PAID', 'PENDING'],
      ['DRAFT', 'PENDING'],
    ];
    const FUTURE_DUE = new Date('2999-01-10T00:00:00.000Z');

    it.each(ALLOWED)('T10 AC-04: %s -> %s is accepted and bumps the version', async (from, to) => {
      const invoice = await seedInvoice({
        status: from as never,
        paidAt: from === 'PAID' ? new Date('2026-01-01T00:00:00Z') : null,
        dueDate: FUTURE_DUE,
      });
      const result = await updateInvoiceStatus(invoice.id, to);
      expect(result).toMatchObject({ success: true, data: { status: to } });
      const stored = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
      expect(stored.status).toBe(to);
      expect(stored.version).toBe(invoice.version + 1);
      expect(stored.paidAt === null).toBe(to !== 'PAID');
    });

    it.each([
      ['PAID', 'DRAFT', 'An issued invoice can never return to draft. Cancel it and duplicate it instead.', 'CANCEL_AND_DUPLICATE'],
      ['PENDING', 'DRAFT', 'An issued invoice can never return to draft. Cancel it and duplicate it instead.', 'CANCEL_AND_DUPLICATE'],
      ['CANCELLED', 'PAID', "A cancelled invoice is final and can't be changed. Duplicate it to make a new draft.", 'DUPLICATE'],
      ['DRAFT', 'CANCELLED', "A draft can't be cancelled. Delete it instead.", null],
      ['DRAFT', 'PAID', "An invoice can't move from DRAFT to PAID.", null],
      ['PAID', 'CANCELLED', "An invoice can't move from PAID to CANCELLED.", null],
    ])('T10 AC-04/05/06: %s -> %s is refused with the contract message', async (from, to, error, suggestion) => {
      const invoice = await seedInvoice({
        status: from as never,
        paidAt: from === 'PAID' ? new Date('2026-01-01T00:00:00Z') : null,
      });
      const result = await updateInvoiceStatus(invoice.id, to);
      expect(result).toEqual({
        success: false,
        code: 'VALIDATION',
        error,
        details: { kind: 'STATUS_NOT_ALLOWED', currentStatus: from, suggestion },
      });
      const stored = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
      expect(stored).toMatchObject({ status: from, version: invoice.version, paidAt: invoice.paidAt });
    });

    it('T10: a hand-marked OVERDUE invoice past its due date cannot go back to pending', async () => {
      const invoice = await seedInvoice({ status: 'OVERDUE', dueDate: new Date('2020-01-10T00:00:00.000Z') });
      const result = await updateInvoiceStatus(invoice.id, 'PENDING');
      expect(result).toMatchObject({
        code: 'VALIDATION',
        error: "This invoice is past its due date, so it can't move back to pending. Move its due date first, or mark it paid.",
      });
    });

    it('T10 AC-04: a same-status request is accepted without a write or a version bump', async () => {
      const paidAt = new Date('2026-01-01T00:00:00.000Z');
      const invoice = await seedInvoice({ status: 'PAID', paidAt, version: 4 });
      const before = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
      const result = await updateInvoiceStatus(invoice.id, 'PAID');
      expect(result).toEqual({ success: true, data: { status: 'PAID', paidAt: paidAt.toISOString() } });
      expect(await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).toEqual(before);
    });

    it('T10 AC-10: marking paid an invoice that was cancelled elsewhere is refused as a change out of cancelled', async () => {
      const invoice = await seedInvoice({ status: 'PENDING' });
      await prisma.invoice.update({ where: { id: invoice.id }, data: { status: 'CANCELLED' } }); // the other tab
      const result = await updateInvoiceStatus(invoice.id, 'PAID');
      expect(result).toEqual({
        success: false,
        code: 'VALIDATION',
        error: "A cancelled invoice is final and can't be changed. Duplicate it to make a new draft.",
        details: { kind: 'STATUS_NOT_ALLOWED', currentStatus: 'CANCELLED', suggestion: 'DUPLICATE' },
      });
    });

    it('T10 AC-14: issuing from the list a stored draft whose currency differs from its bank account is refused; it stays a draft', async () => {
      const invoice = await seedInvoice({ status: 'DRAFT', currency: 'EUR' });
      const result = await updateInvoiceStatus(invoice.id, 'PENDING');
      expect(result).toEqual({
        success: false,
        code: 'VALIDATION',
        error: 'This account is in USD while the invoice is in EUR.',
        fieldErrors: { bankAccountId: ['This account is in USD while the invoice is in EUR.'] },
      });
      const stored = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
      expect(stored).toMatchObject({ status: 'DRAFT', version: invoice.version });
    });

    it('T10: issuing a draft keeps its issued details from the last save (no refresh)', async () => {
      const invoice = await seedInvoice({ status: 'DRAFT', customerName: 'As saved' });
      const result = await updateInvoiceStatus(invoice.id, 'PENDING');
      expect(result.success).toBe(true);
      expect((await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).customerName).toBe('As saved');
    });

    it("T10 AC-23: another Freelancer's invoice is NOT_FOUND and unchanged", async () => {
      const foreign = await seedInvoice({ status: 'PENDING' });
      const other = await createFreelancer(prisma);
      authMock.mockResolvedValue({ user: { id: other.id } });
      const result = await updateInvoiceStatus(foreign.id, 'PAID');
      expect(result).toEqual({ success: false, code: 'NOT_FOUND', error: 'Invoice not found.' });
      expect((await prisma.invoice.findUniqueOrThrow({ where: { id: foreign.id } })).status).toBe('PENDING');
    });

    it('UNAUTHORIZED: no session returns not signed in and touches nothing', async () => {
      const invoice = await seedInvoice({ status: 'DRAFT', paidAt: null });
      authMock.mockResolvedValue(null);

      const result = await updateInvoiceStatus(invoice.id, 'PAID');

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('UNAUTHORIZED');

      const stored = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
      expect(stored.status).toBe('DRAFT');
    });
  }
);

describe.runIf(!containerRuntimeAvailable)('updateInvoiceStatus (T11)', () => {
  it.skip('skipped: no container runtime', () => {});
});
