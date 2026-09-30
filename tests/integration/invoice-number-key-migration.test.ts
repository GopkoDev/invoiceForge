// T07 - Add, backfill and uniquely index Invoice.invoiceNumberKey (expand step, AC-08).
// docs/features/architecture-hardening/tasks/t07-invoice-number-key-migration.md,
// adr/0004-enforce-invoice-number-uniqueness-on-a-normalized-key-column.md, data-model.md
// §Entities/Invoice + §Indexes + §Pre-flight queries.
//
// RED (T07 not yet implemented): the staged migrations under
// docs/features/architecture-hardening/migrations/{02,03,04}_*.{up,down}.sql are NOT yet
// promoted into prisma/migrations/, so `startTestDatabase()`'s `prisma migrate deploy` never
// creates the `invoiceNumberKey` column or its unique index. Every assertion below is expected
// to fail until T07 promotes 02-04 (three consecutive migration folders, 04 alone) and adds
// `invoiceNumberKey String?` + `@@unique([senderProfileId, invoiceNumberKey])` to
// prisma/schema/invoice.prisma.
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
import { createInvoice } from '../support/factories/invoice';
import type { PrismaClient } from '@prisma/client';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

const MIGRATIONS_DIR = path.resolve(
  process.cwd(),
  'docs/features/architecture-hardening/migrations'
);

function stagedSql(name: string): string {
  return fs.readFileSync(path.join(MIGRATIONS_DIR, name), 'utf8');
}

const UP_02 = stagedSql('02_add_invoice_number_key.up.sql');
const DOWN_02 = stagedSql('02_add_invoice_number_key.down.sql');
const UP_03 = stagedSql('03_backfill_invoice_number_key.up.sql');
const DOWN_03 = stagedSql('03_backfill_invoice_number_key.down.sql');
const UP_04 = stagedSql('04_create_invoice_number_key_unique.up.sql');
const DOWN_04 = stagedSql('04_create_invoice_number_key_unique.down.sql');

interface ColumnRow {
  column_name: string;
  data_type: string;
  is_nullable: 'YES' | 'NO';
}

async function columnExists(prisma: PrismaClient, columnName: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_name = 'Invoice' AND column_name = $1
     ) AS "exists"`,
    columnName
  );
  return rows[0]?.exists ?? false;
}

async function readInvoiceNumberKey(prisma: PrismaClient, id: string): Promise<string | null> {
  const rows = await prisma.$queryRawUnsafe<{ invoiceNumberKey: string | null }[]>(
    `SELECT "invoiceNumberKey" FROM "Invoice" WHERE id = $1`,
    id
  );
  return rows[0]?.invoiceNumberKey ?? null;
}

/** Runs the staged down SQL 04 -> 03 -> 02 (idempotent/guarded even if not yet applied) so the
 * database is in the pre-expand (pre-T07) shape, whatever state `prisma migrate deploy` left it
 * in. */
async function revertToPreExpand(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(DOWN_04);
  await prisma.$executeRawUnsafe(DOWN_03);
  await prisma.$executeRawUnsafe(DOWN_02);
}

async function applyExpandSteps(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(UP_02);
  await prisma.$executeRawUnsafe(UP_03);
  await prisma.$executeRawUnsafe(UP_04);
}

describe.runIf(containerRuntimeAvailable)('Invoice.invoiceNumberKey migration (T07, AC-08)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;

  beforeAll(async () => {
    db = await startTestDatabase(); // runs `prisma migrate deploy` against prisma/migrations/
    prisma = createTestPrismaClient(db.connectionString);
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  beforeEach(async () => {
    await truncateAllTables(prisma);
  });

  it('adds a nullable invoiceNumberKey column and a valid unique index on (senderProfileId, invoiceNumberKey), alongside the still-present exact-match unique on (senderProfileId, invoiceNumber)', async () => {
    const columns = await prisma.$queryRaw<ColumnRow[]>`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'Invoice' AND column_name = 'invoiceNumberKey'
    `;

    expect(columns, 'expected an "invoiceNumberKey" column on Invoice').toHaveLength(1);
    expect(columns[0]?.data_type).toBe('text');
    // Expand step only: NOT NULL is T30's job, not T07's.
    expect(columns[0]?.is_nullable, 'invoiceNumberKey must stay nullable in the expand step').toBe(
      'YES'
    );

    const indexRows = await prisma.$queryRaw<
      { indexname: string; indisunique: boolean; indisvalid: boolean }[]
    >`
      SELECT ic.relname AS indexname, ix.indisunique, ix.indisvalid
      FROM pg_index ix
      JOIN pg_class ic ON ic.oid = ix.indexrelid
      WHERE ix.indrelid = '"Invoice"'::regclass
        AND ic.relname = 'Invoice_senderProfileId_invoiceNumberKey_key'
    `;
    expect(
      indexRows,
      'expected the Invoice_senderProfileId_invoiceNumberKey_key unique index to exist'
    ).toHaveLength(1);
    expect(indexRows[0]?.indisunique).toBe(true);
    expect(indexRows[0]?.indisvalid, 'a concurrently-built index left INVALID must be rebuilt').toBe(
      true
    );

    // The old exact-match unique is dropped in T30, not here.
    // Prisma created it as a plain CREATE UNIQUE INDEX (no pg_constraint row), so look in pg_index.
    const oldUniqueRows = await prisma.$queryRaw<{ indisunique: boolean }[]>`
      SELECT ix.indisunique
      FROM pg_index ix
      JOIN pg_class ic ON ic.oid = ix.indexrelid
      WHERE ix.indrelid = '"Invoice"'::regclass
        AND ic.relname = 'Invoice_senderProfileId_invoiceNumber_key'
    `;
    expect(
      oldUniqueRows,
      'expected the pre-existing exact-match unique on (senderProfileId, invoiceNumber) to still exist in the expand step'
    ).toHaveLength(1);
    expect(oldUniqueRows[0]?.indisunique).toBe(true);
  });

  it('backfills invoiceNumberKey = lower(trim(invoiceNumber)) per sender profile, and leaves NULL exactly the rows that share a normalized key within the same profile (ADR-0004 fallback, AC-17)', async () => {
    // Design honestly (per brief): the rows this test backfills must exist BEFORE migrations
    // 02-04 run. Seed them as legacy rows (invoiceNumberKey NULL) while the Prisma model still
    // matches the table, then force the database back to its pre-expand shape.
    const freelancer = await createFreelancer(prisma);
    const profileA = await createSenderProfile(prisma, freelancer.id);
    const profileB = await createSenderProfile(prisma, freelancer.id, { isDefault: false });
    const customer = await createCustomer(prisma, freelancer.id);
    const bankAccountA = await createBankAccount(prisma, profileA.id);
    const bankAccountB = await createBankAccount(prisma, profileB.id);

    // Profile A: a duplicate group under normalization ("INV-001" and " inv-001 " both key to
    // "inv-001") - these two rows must be left NULL by the backfill.
    const dupOne = await createInvoice(prisma, {
      senderProfile: profileA,
      customer,
      bankAccount: bankAccountA,
      overrides: { invoiceNumber: 'INV-001' },
    });
    const dupTwo = await createInvoice(prisma, {
      senderProfile: profileA,
      customer,
      bankAccount: bankAccountA,
      overrides: { invoiceNumber: ' inv-001 ' },
    });

    // Profile A: no duplicate - must get a non-null, normalized key.
    const uniqueInA = await createInvoice(prisma, {
      senderProfile: profileA,
      customer,
      bankAccount: bankAccountA,
      overrides: { invoiceNumber: 'INV-002' },
    });

    // Profile B: same literal text as the profile-A duplicate group, but uniqueness (and the
    // duplicate check) is scoped per sender profile - must get a non-null key.
    const otherProfileSameText = await createInvoice(prisma, {
      senderProfile: profileB,
      customer,
      bankAccount: bankAccountB,
      overrides: { invoiceNumber: 'INV-001' },
    });

    await revertToPreExpand(prisma);
    expect(
      await columnExists(prisma, 'invoiceNumberKey'),
      'expected invoiceNumberKey to be gone after reverting to pre-expand'
    ).toBe(false);

    await applyExpandSteps(prisma);

    // Re-applying 02-04 leaves the schema exactly as `prisma migrate deploy` built it, so the
    // next test starts from the promoted state.
    await expect(readInvoiceNumberKey(prisma, dupOne.id)).resolves.toBeNull();
    await expect(readInvoiceNumberKey(prisma, dupTwo.id)).resolves.toBeNull();
    await expect(readInvoiceNumberKey(prisma, uniqueInA.id)).resolves.toBe('inv-002');
    await expect(readInvoiceNumberKey(prisma, otherProfileSameText.id)).resolves.toBe('inv-001');
  });

  it('applies and reverts cleanly: staged down SQL (04 -> 03 -> 02) removes the index/backfill/column, staged up SQL (02 -> 03 -> 04) restores them', async () => {
    // The column/index must already exist from `prisma migrate deploy` (the promoted
    // migrations), not just from running the staged SQL by hand here - otherwise this test would
    // pass before T07 promotes anything.
    expect(
      await columnExists(prisma, 'invoiceNumberKey'),
      'expected `prisma migrate deploy` to have already created invoiceNumberKey'
    ).toBe(true);

    await prisma.$executeRawUnsafe(DOWN_04);
    const indexAfterDown04 = await prisma.$queryRaw<{ relname: string }[]>`
      SELECT relname FROM pg_class WHERE relname = 'Invoice_senderProfileId_invoiceNumberKey_key'
    `;
    expect(indexAfterDown04).toHaveLength(0);

    await prisma.$executeRawUnsafe(DOWN_03);
    await prisma.$executeRawUnsafe(DOWN_02);
    expect(await columnExists(prisma, 'invoiceNumberKey')).toBe(false);

    await applyExpandSteps(prisma);

    expect(await columnExists(prisma, 'invoiceNumberKey')).toBe(true);
    const indexAfterUp04 = await prisma.$queryRaw<{ indisvalid: boolean }[]>`
      SELECT ix.indisvalid
      FROM pg_index ix
      JOIN pg_class ic ON ic.oid = ix.indexrelid
      WHERE ic.relname = 'Invoice_senderProfileId_invoiceNumberKey_key'
    `;
    expect(indexAfterUp04).toHaveLength(1);
    expect(indexAfterUp04[0]?.indisvalid).toBe(true);
  });
});

describe.runIf(!containerRuntimeAvailable)('Invoice.invoiceNumberKey migration (T07, AC-08)', () => {
  it.skip('skipped: no container runtime', () => {});
});
