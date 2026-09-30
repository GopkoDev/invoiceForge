// T30 - Make invoiceNumberKey NOT NULL and drop the exact-match unique (contract step, AC-08).
// docs/features/architecture-hardening/tasks/t30-invoice-number-key-contract.md,
// adr/0004-enforce-invoice-number-uniqueness-on-a-normalized-key-column.md, data-model.md
// §Entities/Invoice + §Indexes, sad.md §7 (wave table row 4) + §11 (accepted debt).
//
// T30 promoted the staged 05-06 into prisma/migrations/ (two folders, 06 alone) and made
// prisma/schema/invoice.prisma's invoiceNumberKey a required String with only the key unique.
// The first test checks the shape `prisma migrate deploy` leaves; the rest drive the staged
// up/down SQL directly from the pre-contract shape.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { isContainerRuntimeAvailable } from '../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../support/db/container';
import { createTestPrismaClient } from '../support/db/client';
import { truncateAllTables } from '../support/db/truncate';
import { createFreelancer } from '../support/factories/user';
import { createSenderProfile } from '../support/factories/sender-profile';
import { createCustomer } from '../support/factories/customer';
import { createBankAccount } from '../support/factories/bank-account';
import { createInvoice, createLegacyInvoice } from '../support/factories/invoice';
import type { PrismaClient } from '@prisma/client';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

const MIGRATIONS_DIR = path.resolve(
  process.cwd(),
  'docs/features/architecture-hardening/migrations'
);

function stagedSql(name: string): string {
  return fs.readFileSync(path.join(MIGRATIONS_DIR, name), 'utf8');
}

const UP_05 = stagedSql('05_set_invoice_number_key_not_null.up.sql');
const DOWN_05 = stagedSql('05_set_invoice_number_key_not_null.down.sql');
const UP_06 = stagedSql('06_drop_invoice_number_exact_unique.up.sql');
const DOWN_06 = stagedSql('06_drop_invoice_number_exact_unique.down.sql');

interface NullableRow {
  is_nullable: 'YES' | 'NO';
}

async function isInvoiceNumberKeyNullable(prisma: PrismaClient): Promise<boolean> {
  const rows = await prisma.$queryRaw<NullableRow[]>`
    SELECT is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Invoice' AND column_name = 'invoiceNumberKey'
  `;
  return rows[0]?.is_nullable === 'YES';
}

/** Prisma created the pre-existing exact-match unique as a plain CREATE UNIQUE INDEX (no
 * pg_constraint row - see T07's precedent), so look in pg_index, not pg_constraint. */
async function exactUniqueExists(prisma: PrismaClient): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ indisunique: boolean }[]>`
    SELECT ix.indisunique
    FROM pg_index ix
    JOIN pg_class ic ON ic.oid = ix.indexrelid
    WHERE ix.indrelid = '"Invoice"'::regclass
      AND ic.relname = 'Invoice_senderProfileId_invoiceNumber_key'
  `;
  return rows.length > 0;
}

async function keyUniqueState(
  prisma: PrismaClient
): Promise<{ exists: boolean; valid: boolean }> {
  const rows = await prisma.$queryRaw<{ indisunique: boolean; indisvalid: boolean }[]>`
    SELECT ix.indisunique, ix.indisvalid
    FROM pg_index ix
    JOIN pg_class ic ON ic.oid = ix.indexrelid
    WHERE ix.indrelid = '"Invoice"'::regclass
      AND ic.relname = 'Invoice_senderProfileId_invoiceNumberKey_key'
  `;
  const row = rows[0];
  return { exists: !!row, valid: row?.indisvalid ?? false };
}

/** Brings the database back to the pre-contract (T07 expand-step) shape - invoiceNumberKey
 * nullable, exact-match unique present - whatever the previous test left behind, using the
 * staged down SQL directly (mirrors T07's revertToPreExpand/applyExpandSteps precedent). */
async function resetToPreContractShape(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(DOWN_05); // idempotent: DROP NOT NULL on an already-nullable column is a no-op
  if (!(await exactUniqueExists(prisma))) {
    await prisma.$executeRawUnsafe(DOWN_06); // CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS
  }
}

describe.runIf(containerRuntimeAvailable)(
  'Invoice.invoiceNumberKey contract (T30, AC-08)',
  () => {
    let db: TestDatabase;
    let prisma: PrismaClient;
    // The shape `prisma migrate deploy` left, captured before any beforeEach reset reverts it.
    let deployed: { nullable: boolean; exactUnique: boolean; keyUnique: { exists: boolean; valid: boolean } };

    beforeAll(async () => {
      db = await startTestDatabase(); // runs `prisma migrate deploy` against prisma/migrations/
      prisma = createTestPrismaClient(db.connectionString);
      deployed = {
        nullable: await isInvoiceNumberKeyNullable(prisma),
        exactUnique: await exactUniqueExists(prisma),
        keyUnique: await keyUniqueState(prisma),
      };
    }, 60_000);

    afterAll(async () => {
      await prisma?.$disconnect();
      await db?.stop();
    });

    beforeEach(async () => {
      await truncateAllTables(prisma);
      await resetToPreContractShape(prisma);
    });

    it('makes invoiceNumberKey NOT NULL and drops the exact-match unique once `prisma migrate deploy` has promoted 05-06, leaving the key unique valid', async () => {
      expect(
        deployed.nullable,
        'expected `prisma migrate deploy` to have promoted 05 (invoiceNumberKey NOT NULL)'
      ).toBe(false);

      expect(
        deployed.exactUnique,
        'expected `prisma migrate deploy` to have promoted 06 (exact-match unique Invoice_senderProfileId_invoiceNumber_key dropped)'
      ).toBe(false);

      const keyUnique = deployed.keyUnique;
      expect(
        keyUnique.exists,
        'expected the key unique Invoice_senderProfileId_invoiceNumberKey_key to still exist'
      ).toBe(true);
      expect(keyUnique.valid, 'expected the key unique index to still be valid').toBe(true);
    });

    it('refuses to apply 05 while a NULL invoiceNumberKey remains, and applies nothing on failure (edge case table)', async () => {
      const freelancer = await createFreelancer(prisma);
      const profile = await createSenderProfile(prisma, freelancer.id);
      const customer = await createCustomer(prisma, freelancer.id);
      const bankAccount = await createBankAccount(prisma, profile.id);

      const legacy = await createLegacyInvoice(prisma, { senderProfile: profile, customer, bankAccount });
      // The factory writes a key since T30; clear it to reproduce a row the backfill left NULL.
      await prisma.$executeRawUnsafe(`UPDATE "Invoice" SET "invoiceNumberKey" = NULL WHERE id = $1`, legacy.id);

      await expect(
        prisma.$executeRawUnsafe(UP_05),
        'expected ALTER COLUMN "invoiceNumberKey" SET NOT NULL to fail with a NULL row present'
      ).rejects.toThrow();

      expect(
        await isInvoiceNumberKeyNullable(prisma),
        'a failed ALTER COLUMN SET NOT NULL must apply nothing'
      ).toBe(true);
    });

    it('rejects two invoices in the same sender profile whose numbers differ only by case/whitespace once invoiceNumberKey is mandatory (AC-08)', async () => {
      const freelancer = await createFreelancer(prisma);
      const profile = await createSenderProfile(prisma, freelancer.id);
      const customer = await createCustomer(prisma, freelancer.id);
      const bankAccount = await createBankAccount(prisma, profile.id);

      await prisma.$executeRawUnsafe(UP_05);
      await prisma.$executeRawUnsafe(UP_06);

      await createInvoice(prisma, {
        senderProfile: profile,
        customer,
        bankAccount,
        overrides: { invoiceNumber: 'INV-001', invoiceNumberKey: 'inv-001' },
      });

      await expect(
        createInvoice(prisma, {
          senderProfile: profile,
          customer,
          bankAccount,
          overrides: { invoiceNumber: ' inv-001 ', invoiceNumberKey: 'inv-001' },
        }),
        'expected the save of " inv-001 " to be blocked as already used in this sender profile'
      ).rejects.toThrow();
    });

    it('applies and reverts cleanly: staged down SQL (06 -> 05) restores the nullable column and the exact-match unique, staged up SQL (05 -> 06) reapplies the contract', async () => {
      const freelancer = await createFreelancer(prisma);
      const profile = await createSenderProfile(prisma, freelancer.id);
      const customer = await createCustomer(prisma, freelancer.id);
      const bankAccount = await createBankAccount(prisma, profile.id);
      await createInvoice(prisma, {
        senderProfile: profile,
        customer,
        bankAccount,
        overrides: { invoiceNumber: 'INV-100', invoiceNumberKey: 'inv-100' },
      });

      await prisma.$executeRawUnsafe(UP_05);
      await prisma.$executeRawUnsafe(UP_06);

      expect(await isInvoiceNumberKeyNullable(prisma)).toBe(false);
      expect(await exactUniqueExists(prisma)).toBe(false);

      await prisma.$executeRawUnsafe(DOWN_06);
      await prisma.$executeRawUnsafe(DOWN_05);

      expect(
        await isInvoiceNumberKeyNullable(prisma),
        'expected 05.down to restore invoiceNumberKey to nullable'
      ).toBe(true);
      expect(
        await exactUniqueExists(prisma),
        'expected 06.down to restore the exact-match unique'
      ).toBe(true);

      await prisma.$executeRawUnsafe(UP_05);
      await prisma.$executeRawUnsafe(UP_06);

      expect(await isInvoiceNumberKeyNullable(prisma)).toBe(false);
      expect(await exactUniqueExists(prisma)).toBe(false);
      const keyUnique = await keyUniqueState(prisma);
      expect(keyUnique.exists).toBe(true);
      expect(keyUnique.valid).toBe(true);
    });
  }
);

describe.runIf(!containerRuntimeAvailable)('Invoice.invoiceNumberKey contract (T30, AC-08)', () => {
  it.skip('skipped: no container runtime', () => {});
});
