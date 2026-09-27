// T21 (spec.md §5 AC-16, AC-31) — createCustomPrice / updateCustomPrice: the shared schema
// runs on both create and update (AC-16), and every custom price is linked to exactly the
// explicit, caller-owned Customer and product — a foreign Customer or product is blocked as
// not found (AC-31). See
// docs/features/architecture-hardening/tasks/t21-custom-price-validation-and-links.md.
//
// Inlined context (contracts/server-actions.md §createCustomPrice / §updateCustomPrice,
// verbatim): createCustomPrice's input is `{ customerId, productId, name?, price, notes? }`
// with `customerId` explicit and required (L10 fix: was `context.customerId || data.productId`).
// Order: UNAUTHORIZED -> VALIDATION (schema, before the lookups) -> NOT_FOUND if the customer
// *or* product isn't the caller's, one message "Customer or product not found." -> success.
// updateCustomPrice(id, { name?, price, notes? }) drops the customerId/productId arguments
// (flow 9: the price keeps its existing link); ownership is the chain
// CustomPrice -> Customer.userId. Same schema and messages as create (AC-16).
//
// test-plan.md rows (AC-16, AC-31, integration):
//   - "updating a custom price with invalid values is blocked": VALIDATION with the same field
//     messages as create; the stored price is unchanged.
//   - "custom price links exactly the chosen owned Customer and product": created from the
//     product page and from the customer page, it stores exactly the chosen ids.
//   - "custom price for a Customer or product that isn't the caller's is blocked as not found":
//     NOT_FOUND for a foreign Customer and for a foreign product. Nothing is saved.
//
// Assumed API/result shapes (task file §API contract, verbatim; types/actions.ts ActionResult):
//   createCustomPrice(data: { customerId, productId, name?, price, notes? }):
//     Promise<ActionResult<{ id: string }>>
//   updateCustomPrice(id: string, data: { name?, price, notes? }): Promise<ActionResult<void>>
//   VALIDATION: fieldErrors.price = ["Price must be positive."]; NOT_FOUND:
//     error === "Customer or product not found."
//
// Seams: same-process app code (tests/README.md option 1), same pattern as
// sender-profile-https-logo.test.ts: DATABASE_URL + vi.resetModules() + dynamic import, mock
// '@/auth', stub 'next/cache'. Real throwaway Postgres container.
//
// RED (T21 not yet implemented): createCustomPrice's current signature is
// `createCustomPrice(data, context: { customerId?, productId? })`, and it derives
// `customerId = context.customerId || data.productId` (the L10 bug: falls back to the
// *product* id, not a customer id) rather than requiring an explicit `data.customerId`.
// updateCustomPrice's current signature is `updateCustomPrice(id, customerId, data, productId?)`
// — a positional `customerId` argument, not `updateCustomPrice(id, data)` — and it never
// re-validates with a shared schema message set (`customPriceFormSchema`'s price message is
// "Price must be a number"/"Price must be positive" without the contract's trailing period, and
// there is no notes-length message at all). Calling either action with the new one/two-arg
// contract shape mismatches the current signatures, so these calls fail (wrong data saved, a
// thrown TypeError turned into `FAILED`, or a validation message that doesn't match the
// contract) rather than producing the AC-16/AC-31 outcomes below.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../support/db/container';
import { createTestPrismaClient } from '../../support/db/client';
import { truncateAllTables } from '../../support/db/truncate';
import { createFreelancer } from '../../support/factories/user';
import { createCustomer } from '../../support/factories/customer';
import { createProduct } from '../../support/factories/product';
import { createCustomPrice as seedCustomPriceRow } from '../../support/factories/custom-price';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

// --- mock '@/auth' so a test drives the session outcome directly (same seam as
// sender-profile-https-logo.test.ts). ------------------------------------------------------
const authMock = vi.fn<() => Promise<{ user: { id: string } } | null>>();
vi.mock('@/auth', () => ({ auth: () => authMock() }));

// --- next/cache's revalidatePath needs a live request/static-generation store, which this
// same-process (non-served) import never has. Stubbed out, orthogonal to what this suite tests. -
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

const NOT_FOUND_MESSAGE = 'Customer or product not found.';
const PRICE_NOT_POSITIVE = 'Price must be positive.';

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; code: string; error: string; fieldErrors?: Record<string, string[]> };

type CreateCustomPriceInput = {
  customerId: string;
  productId: string;
  name?: string;
  price: number;
  notes?: string;
};
type UpdateCustomPriceInput = { name?: string; price: number; notes?: string };

type CreateCustomPrice = (
  data: CreateCustomPriceInput
) => Promise<ActionResult<{ id: string }>>;
type UpdateCustomPrice = (
  id: string,
  data: UpdateCustomPriceInput
) => Promise<ActionResult<void>>;

describe.runIf(containerRuntimeAvailable)(
  'createCustomPrice / updateCustomPrice — validation and links (T21, AC-16, AC-31)',
  () => {
    let db: TestDatabase;
    let prisma: PrismaClient;
    let createCustomPrice: CreateCustomPrice;
    let updateCustomPrice: UpdateCustomPrice;

    beforeAll(async () => {
      db = await startTestDatabase();
      process.env.DATABASE_URL = db.connectionString;
      vi.resetModules();
      prisma = createTestPrismaClient(db.connectionString);
      ({ createCustomPrice, updateCustomPrice } = (await import(
        '@/lib/actions/custom-price-actions'
      )) as unknown as {
        createCustomPrice: CreateCustomPrice;
        updateCustomPrice: UpdateCustomPrice;
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

    it('AC-31: links the created custom price to exactly the chosen owned Customer and product', async () => {
      const freelancer = await createFreelancer(prisma, { email: 'ac31-links@example.com' });
      const customerA = await createCustomer(prisma, freelancer.id, { name: 'Customer A' });
      const customerB = await createCustomer(prisma, freelancer.id, { name: 'Customer B' });
      const product = await createProduct(prisma, freelancer.id, { price: 100 });
      authMock.mockResolvedValue({ user: { id: freelancer.id } });

      const result = await createCustomPrice({
        customerId: customerA.id,
        productId: product.id,
        price: 80,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      const row = await prisma.customPrice.findUnique({ where: { id: result.data.id } });
      expect(row?.customerId).toBe(customerA.id);
      expect(row?.customerId).not.toBe(customerB.id);
      expect(row?.productId).toBe(product.id);
    });

    it('AC-31: createCustomPrice blocks a foreign Customer as NOT_FOUND and saves nothing', async () => {
      const freelancer = await createFreelancer(prisma, { email: 'ac31-foreign-customer@example.com' });
      const stranger = await createFreelancer(prisma, { email: 'ac31-stranger-customer@example.com' });
      const foreignCustomer = await createCustomer(prisma, stranger.id, { name: 'Not mine' });
      const product = await createProduct(prisma, freelancer.id, { price: 100 });
      authMock.mockResolvedValue({ user: { id: freelancer.id } });

      const result = await createCustomPrice({
        customerId: foreignCustomer.id,
        productId: product.id,
        price: 80,
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('NOT_FOUND');
      expect(result.error).toBe(NOT_FOUND_MESSAGE);

      const rows = await prisma.customPrice.findMany({ where: { productId: product.id } });
      expect(rows).toHaveLength(0);
    });

    it('AC-31: createCustomPrice blocks a foreign product as NOT_FOUND and saves nothing', async () => {
      const freelancer = await createFreelancer(prisma, { email: 'ac31-foreign-product@example.com' });
      const stranger = await createFreelancer(prisma, { email: 'ac31-stranger-product@example.com' });
      const customer = await createCustomer(prisma, freelancer.id, { name: 'Mine' });
      const foreignProduct = await createProduct(prisma, stranger.id, { price: 100 });
      authMock.mockResolvedValue({ user: { id: freelancer.id } });

      const result = await createCustomPrice({
        customerId: customer.id,
        productId: foreignProduct.id,
        price: 80,
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('NOT_FOUND');
      expect(result.error).toBe(NOT_FOUND_MESSAGE);

      const rows = await prisma.customPrice.findMany({ where: { customerId: customer.id } });
      expect(rows).toHaveLength(0);
    });

    it('AC-16: createCustomPrice blocks a negative price with VALIDATION fieldErrors.price and saves nothing', async () => {
      const freelancer = await createFreelancer(prisma, { email: 'ac16-create-negative@example.com' });
      const customer = await createCustomer(prisma, freelancer.id);
      const product = await createProduct(prisma, freelancer.id, { price: 100 });
      authMock.mockResolvedValue({ user: { id: freelancer.id } });

      const result = await createCustomPrice({
        customerId: customer.id,
        productId: product.id,
        price: -5,
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('VALIDATION');
      expect(result.fieldErrors?.price).toEqual([PRICE_NOT_POSITIVE]);

      const rows = await prisma.customPrice.findMany({ where: { productId: product.id } });
      expect(rows).toHaveLength(0);
    });

    it('AC-16: updateCustomPrice blocks a negative price with the same VALIDATION message as create, and leaves the stored price unchanged', async () => {
      const freelancer = await createFreelancer(prisma, { email: 'ac16-update-negative@example.com' });
      const customer = await createCustomer(prisma, freelancer.id);
      const product = await createProduct(prisma, freelancer.id, { price: 100 });
      const existing = await seedCustomPriceRow(prisma, product.id, customer.id, { price: 60 });
      authMock.mockResolvedValue({ user: { id: freelancer.id } });

      const result = await updateCustomPrice(existing.id, { price: -5 });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('VALIDATION');
      expect(result.fieldErrors?.price).toEqual([PRICE_NOT_POSITIVE]);

      const stillOriginal = await prisma.customPrice.findUnique({ where: { id: existing.id } });
      expect(Number(stillOriginal?.price)).toBe(60);
    });

    it("AC-31: updateCustomPrice can't be used to touch another Freelancer's custom price — NOT_FOUND, nothing changed", async () => {
      const owner = await createFreelancer(prisma, { email: 'ac31-update-owner@example.com' });
      const intruder = await createFreelancer(prisma, { email: 'ac31-update-intruder@example.com' });
      const customer = await createCustomer(prisma, owner.id);
      const product = await createProduct(prisma, owner.id, { price: 100 });
      const existing = await seedCustomPriceRow(prisma, product.id, customer.id, { price: 60 });
      authMock.mockResolvedValue({ user: { id: intruder.id } });

      const result = await updateCustomPrice(existing.id, { price: 75 });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.code).toBe('NOT_FOUND');

      const stillOriginal = await prisma.customPrice.findUnique({ where: { id: existing.id } });
      expect(Number(stillOriginal?.price)).toBe(60);
    });
  }
);

describe.runIf(!containerRuntimeAvailable)(
  'createCustomPrice / updateCustomPrice — validation and links (T21)',
  () => {
    it.skip('skipped: no container runtime', () => {});
  }
);
