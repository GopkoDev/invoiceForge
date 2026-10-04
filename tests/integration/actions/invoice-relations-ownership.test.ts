// T40 — F-43 and F-48 (docs/features/architecture-hardening/_review/review-2026-09-27.md,
// Group 8), tasks.json T40.
//
// F-43: verifyInvoiceRelations only checks a bank account belongs to SOME sender profile owned
// by the caller (`bankAccount: { senderProfile: { userId } }`), never that it belongs to the
// SPECIFIC sender profile the invoice is being saved under. That lets an invoice end up with
// senderProfileId = A but bankAccountId belonging to the same Freelancer's profile B. When B is
// later deleted, deleteSenderProfile's count (and its P2003 recount) only look at
// `invoices.senderProfileId = B`, missing that mismatched invoice entirely, so the delete either
// succeeds and orphans data or fails as an uncaught P2003 with a CONFLICT count of 0.
//
// F-48: item.productId is stored with no ownership check at all — a request can carry another
// Freelancer's product id, and invoice-actions.ts saves it verbatim (lib/actions/invoice-actions/
// invoice-actions.ts:340-343, 554-557). That foreign product then can't have its currency/unit
// changed or be deleted by ITS owner without the "used in N invoice(s)" conflict counting an
// invoice that isn't even the product owner's.
//
// Seams: same-process app code, same pattern as create-and-duplicate-invoice.test.ts /
// delete-blocked-by-invoices.test.ts: DATABASE_URL + vi.resetModules() + dynamic import, mock
// '@/auth', stub 'next/cache'. Real throwaway Postgres container.
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
import { createProduct } from '../../support/factories/product';
import { createInvoice as seedInvoiceRow } from '../../support/factories/invoice';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

const authMock = vi.fn<() => Promise<{ user: { id: string } } | null>>();
vi.mock('@/auth', () => ({ auth: () => authMock() }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

type ActionResult<T> =
  | { success: true; data: T }
  | {
      success: false;
      code: string;
      error: string;
      fieldErrors?: Record<string, string[]>;
      details?: { kind: string; invoiceCount?: number };
    };
type FormItem = {
  id: string;
  productId?: string;
  productName: string;
  unit: string;
  quantity: number;
  price: number;
  total: number;
};
type FormValues = Record<string, unknown> & { items: FormItem[] };
type SavedInvoice = { id: string; invoiceNumber: string };
type CreateInvoice = (data: FormValues) => Promise<ActionResult<SavedInvoice>>;
type DeleteSenderProfile = (id: string) => Promise<ActionResult<void>>;

function baseItems(): FormItem[] {
  return [
    { id: 'item-0', productName: 'Widget', unit: 'pcs', quantity: 1, price: 10, total: 10 },
  ];
}

describe.runIf(containerRuntimeAvailable)(
  'invoice relations ownership (T40, F-43, F-48)',
  () => {
    let db: TestDatabase;
    let prisma: PrismaClient;
    let createInvoice: CreateInvoice;
    let deleteSenderProfile: DeleteSenderProfile;

    beforeAll(async () => {
      db = await startTestDatabase();
      process.env.DATABASE_URL = db.connectionString;
      vi.resetModules();
      prisma = createTestPrismaClient(db.connectionString);
      ({ createInvoice } = (await import(
        '@/lib/actions/invoice-actions/invoice-actions'
      )) as unknown as { createInvoice: CreateInvoice });
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

    it('F-43: createInvoice refuses a bank account that belongs to a DIFFERENT sender profile of the same Freelancer', async () => {
      const freelancer = await createFreelancer(prisma);
      const profileA = await createSenderProfile(prisma, freelancer.id);
      const profileB = await createSenderProfile(prisma, freelancer.id);
      const bankAccountOfB = await createBankAccount(prisma, profileB.id);
      const customer = await createCustomer(prisma, freelancer.id);
      authMock.mockResolvedValue({ user: { id: freelancer.id } });

      const result = await createInvoice({
        invoiceNumber: '',
        senderProfileId: profileA.id,
        // Owned by this Freelancer, but under profile B, not the profile A this invoice claims.
        bankAccountId: bankAccountOfB.id,
        customerId: customer.id,
        issueDate: new Date().toISOString().slice(0, 10),
        dueDate: new Date().toISOString().slice(0, 10),
        currency: 'USD',
        items: baseItems(),
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('NOT_FOUND');

      const invoiceCount = await prisma.invoice.count({ where: { senderProfileId: profileA.id } });
      expect(invoiceCount).toBe(0);
    });

    it('F-43: deleting a sender profile is blocked by an invoice using that profile\'s bank account even when the invoice\'s own senderProfileId differs', async () => {
      const freelancer = await createFreelancer(prisma);
      const profileA = await createSenderProfile(prisma, freelancer.id);
      const profileB = await createSenderProfile(prisma, freelancer.id);
      const bankAccountOfA = await createBankAccount(prisma, profileA.id);
      const customer = await createCustomer(prisma, freelancer.id);
      // Seeded directly (bypassing createInvoice's own ownership check) to simulate legacy data
      // saved before this ownership tie existed.
      await seedInvoiceRow(prisma, {
        senderProfile: profileB,
        customer,
        bankAccount: bankAccountOfA,
      });
      authMock.mockResolvedValue({ user: { id: freelancer.id } });

      const result = await deleteSenderProfile(profileA.id);

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('CONFLICT');
      expect(result.details).toEqual({ kind: 'HAS_INVOICES', invoiceCount: 1 });

      const stillThere = await prisma.senderProfile.findUnique({ where: { id: profileA.id } });
      expect(stillThere).not.toBeNull();
    });

    it("F-48: createInvoice refuses an item's productId that belongs to a different Freelancer", async () => {
      const owner = await createFreelancer(prisma, { email: 'f48-owner@example.com' });
      const stranger = await createFreelancer(prisma, { email: 'f48-stranger@example.com' });
      const senderProfile = await createSenderProfile(prisma, owner.id);
      const bankAccount = await createBankAccount(prisma, senderProfile.id);
      const customer = await createCustomer(prisma, owner.id);
      const foreignProduct = await createProduct(prisma, stranger.id, { name: 'Not mine' });
      authMock.mockResolvedValue({ user: { id: owner.id } });

      const result = await createInvoice({
        invoiceNumber: '',
        senderProfileId: senderProfile.id,
        bankAccountId: bankAccount.id,
        customerId: customer.id,
        issueDate: new Date().toISOString().slice(0, 10),
        dueDate: new Date().toISOString().slice(0, 10),
        currency: 'USD',
        items: [
          {
            id: 'item-0',
            productId: foreignProduct.id,
            productName: 'Widget',
            unit: 'pcs',
            quantity: 1,
            price: 10,
            total: 10,
          },
        ],
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(['NOT_FOUND', 'VALIDATION']).toContain(result.code);

      const strangerInvoiceItems = await prisma.invoiceItem.count({
        where: { productId: foreignProduct.id },
      });
      expect(strangerInvoiceItems).toBe(0);
    });

    it('F-48: createInvoice accepts the caller\'s own product id (no false rejection)', async () => {
      const owner = await createFreelancer(prisma, { email: 'f48-own-product@example.com' });
      const senderProfile = await createSenderProfile(prisma, owner.id);
      const bankAccount = await createBankAccount(prisma, senderProfile.id);
      const customer = await createCustomer(prisma, owner.id);
      const ownProduct = await createProduct(prisma, owner.id, { name: 'Mine' });
      authMock.mockResolvedValue({ user: { id: owner.id } });

      const result = await createInvoice({
        invoiceNumber: '',
        senderProfileId: senderProfile.id,
        bankAccountId: bankAccount.id,
        customerId: customer.id,
        issueDate: new Date().toISOString().slice(0, 10),
        dueDate: new Date().toISOString().slice(0, 10),
        currency: 'USD',
        items: [
          {
            id: 'item-0',
            productId: ownProduct.id,
            productName: 'Mine',
            unit: 'pcs',
            quantity: 1,
            price: 10,
            total: 10,
          },
        ],
      });

      expect(result.success).toBe(true);
    });
  }
);

describe.runIf(!containerRuntimeAvailable)('invoice relations ownership (T40)', () => {
  it.skip('skipped: no container runtime', () => {});
});
