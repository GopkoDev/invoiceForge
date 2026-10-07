// invoice-integrity T02 - Invoice.version, the Invoice.bankAccountId index, and the release repair +
// partial unique indexes for single defaults (AC-18, ADR-0005).
// docs/features/invoice-integrity/tasks/t02-promote-migrations-and-test-support.md,
// data-model.md §Release repair of defaults + §Test fixtures.
//
// The staged files under docs/features/invoice-integrity/migrations/ are the design record; the
// promoted copies in prisma/migrations/ are what `prisma migrate deploy` applies. Each test runs the
// staged SQL through psql inside the container, because 03/04 carry their own BEGIN/COMMIT.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../support/db/container';
import { createTestPrismaClient } from '../support/db/client';
import { truncateAllTables } from '../support/db/truncate';
import { createFreelancer } from '../support/factories/user';
import { createSenderProfile } from '../support/factories/sender-profile';
import { createBankAccount } from '../support/factories/bank-account';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

const STAGED_DIR = path.resolve(process.cwd(), 'docs/features/invoice-integrity/migrations');
const staged = (name: string) => fs.readFileSync(path.join(STAGED_DIR, name), 'utf8');

const UP = {
  '01': staged('01_add_invoice_version.up.sql'),
  '02': staged('02_create_invoice_bank_account_id_index.up.sql'),
  '03': staged('03_single_default_sender_profile.up.sql'),
  '04': staged('04_single_default_bank_account.up.sql'),
};
const DOWN = {
  '01': staged('01_add_invoice_version.down.sql'),
  '02': staged('02_create_invoice_bank_account_id_index.down.sql'),
  '03': staged('03_single_default_sender_profile.down.sql'),
  '04': staged('04_single_default_bank_account.down.sql'),
};

const SENDER_INDEX = 'SenderProfile_userId_isDefault_key';
const BANK_INDEX = 'BankAccount_senderProfileId_isDefault_key';
const BANK_ID_INDEX = 'Invoice_bankAccountId_idx';

describe.runIf(containerRuntimeAvailable)('invoice-integrity migrations (T02, AC-18)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;

  async function psql(sql: string): Promise<void> {
    const result = await db.container.exec([
      'psql',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'test',
      '-d',
      'invoice_forge_test',
      '-c',
      sql,
    ]);
    if (result.exitCode !== 0) throw new Error(`psql failed: ${result.output}`);
  }

  async function indexInfo(name: string) {
    return prisma.$queryRaw<{ indisunique: boolean; indisvalid: boolean; pred: string | null }[]>`
      SELECT ix.indisunique, ix.indisvalid, pg_get_expr(ix.indpred, ix.indrelid) AS pred
      FROM pg_index ix JOIN pg_class ic ON ic.oid = ix.indexrelid
      WHERE ic.relname = ${name}
    `;
  }

  async function versionColumn() {
    return prisma.$queryRaw<{ data_type: string; is_nullable: string; column_default: string }[]>`
      SELECT data_type, is_nullable, column_default FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'Invoice' AND column_name = 'version'
    `;
  }

  /** Inserts a row with an explicit createdAt/updatedAt so "earliest-created" is deterministic. */
  async function insertProfile(userId: string, id: string, createdAt: string, isDefault: boolean) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "SenderProfile" (id, "userId", name, "invoicePrefix", "isDefault", "createdAt", "updatedAt")
       VALUES ($1, $2, $1, $1, $3, $4::timestamp, '2020-01-01T00:00:00Z')`,
      id,
      userId,
      isDefault,
      createdAt
    );
  }

  async function insertAccount(profileId: string, id: string, createdAt: string, isDefault: boolean) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "BankAccount" (id, "senderProfileId", "bankName", "accountName", "accountNumber", currency, "isDefault", "createdAt", "updatedAt")
       VALUES ($1, $2, 'Test Bank', 'Test Freelancer', '0000000000', 'USD', $3, $4::timestamp, '2020-01-01T00:00:00Z')`,
      id,
      profileId,
      isDefault,
      createdAt
    );
  }

  async function defaults(table: 'SenderProfile' | 'BankAccount') {
    const rows = await prisma.$queryRawUnsafe<{ id: string; isDefault: boolean; updatedAt: Date }[]>(
      `SELECT id, "isDefault", "updatedAt" FROM "${table}" ORDER BY id`
    );
    return Object.fromEntries(rows.map((r) => [r.id, r]));
  }

  beforeAll(async () => {
    db = await startTestDatabase(); // `prisma migrate deploy` over prisma/migrations/
    prisma = createTestPrismaClient(db.connectionString);
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  beforeEach(async () => {
    await truncateAllTables(prisma);
  });

  it('promoted migrations add Invoice.version (INTEGER NOT NULL DEFAULT 0), the bankAccountId index and both partial unique indexes', async () => {
    const column = await versionColumn();
    expect(column, 'expected `prisma migrate deploy` to create Invoice.version').toHaveLength(1);
    expect(column[0]).toMatchObject({ data_type: 'integer', is_nullable: 'NO', column_default: '0' });

    const bankIdIndex = await indexInfo(BANK_ID_INDEX);
    expect(bankIdIndex).toHaveLength(1);
    expect(bankIdIndex[0]?.indisvalid).toBe(true);

    for (const name of [SENDER_INDEX, BANK_INDEX]) {
      const info = await indexInfo(name);
      expect(info, `expected ${name}`).toHaveLength(1);
      expect(info[0]?.indisunique).toBe(true);
      expect(info[0]?.pred).toBe('("isDefault" = true)');
    }
  });

  it('repairs defaults: several → earliest stays, none → earliest promoted, one non-earliest → unchanged; updatedAt untouched (AC-18)', async () => {
    await psql(DOWN['04']);
    await psql(DOWN['03']);

    const two = await createFreelancer(prisma);
    const none = await createFreelancer(prisma);
    const late = await createFreelancer(prisma);
    // Two defaults; the tie on createdAt is broken by id.
    await insertProfile(two.id, 'sp-two-b', '2024-01-01T00:00:00Z', true);
    await insertProfile(two.id, 'sp-two-a', '2024-01-01T00:00:00Z', true);
    await insertProfile(two.id, 'sp-two-c', '2023-06-01T00:00:00Z', false);
    // No default at all.
    await insertProfile(none.id, 'sp-none-a', '2024-02-01T00:00:00Z', false);
    await insertProfile(none.id, 'sp-none-b', '2024-01-01T00:00:00Z', false);
    // Exactly one default that is not the earliest.
    await insertProfile(late.id, 'sp-late-a', '2024-01-01T00:00:00Z', false);
    await insertProfile(late.id, 'sp-late-b', '2024-03-01T00:00:00Z', true);

    // Accounts under the non-default profile sp-two-c: repaired per profile, independently.
    await insertAccount('sp-two-c', 'ba-two-a', '2024-02-01T00:00:00Z', true);
    await insertAccount('sp-two-c', 'ba-two-b', '2024-01-01T00:00:00Z', true);
    await insertAccount('sp-none-b', 'ba-none-a', '2024-02-01T00:00:00Z', false);
    await insertAccount('sp-none-b', 'ba-none-b', '2024-01-01T00:00:00Z', false);
    await insertAccount('sp-late-b', 'ba-late-a', '2024-01-01T00:00:00Z', false);
    await insertAccount('sp-late-b', 'ba-late-b', '2024-03-01T00:00:00Z', true);

    await psql(UP['03']);
    await psql(UP['04']);

    const profiles = await defaults('SenderProfile');
    expect({
      'sp-two-a': profiles['sp-two-a']?.isDefault,
      'sp-two-b': profiles['sp-two-b']?.isDefault,
      'sp-two-c': profiles['sp-two-c']?.isDefault,
      'sp-none-a': profiles['sp-none-a']?.isDefault,
      'sp-none-b': profiles['sp-none-b']?.isDefault,
      'sp-late-a': profiles['sp-late-a']?.isDefault,
      'sp-late-b': profiles['sp-late-b']?.isDefault,
    }).toEqual({
      'sp-two-a': true,
      'sp-two-b': false,
      'sp-two-c': false,
      'sp-none-a': false,
      'sp-none-b': true,
      'sp-late-a': false,
      'sp-late-b': true,
    });

    const accounts = await defaults('BankAccount');
    expect({
      'ba-two-a': accounts['ba-two-a']?.isDefault,
      'ba-two-b': accounts['ba-two-b']?.isDefault,
      'ba-none-a': accounts['ba-none-a']?.isDefault,
      'ba-none-b': accounts['ba-none-b']?.isDefault,
      'ba-late-a': accounts['ba-late-a']?.isDefault,
      'ba-late-b': accounts['ba-late-b']?.isDefault,
    }).toEqual({
      'ba-two-a': false,
      'ba-two-b': true,
      'ba-none-a': false,
      'ba-none-b': true,
      'ba-late-a': false,
      'ba-late-b': true,
    });

    for (const row of [...Object.values(profiles), ...Object.values(accounts)]) {
      expect(row.updatedAt.toISOString(), `updatedAt of ${row.id}`).toBe('2020-01-01T00:00:00.000Z');
    }

    // Re-running is a no-op.
    await psql(UP['03']);
    await psql(UP['04']);
    expect(await defaults('SenderProfile')).toEqual(profiles);
    expect(await defaults('BankAccount')).toEqual(accounts);
  });

  it('the partial unique indexes refuse a second default with P2002 (database backstop)', async () => {
    const freelancer = await createFreelancer(prisma);
    const first = await createSenderProfile(prisma, freelancer.id, { isDefault: true });
    const second = await createSenderProfile(prisma, freelancer.id, { isDefault: false });
    await expect(
      prisma.senderProfile.update({ where: { id: second.id }, data: { isDefault: true } })
    ).rejects.toMatchObject({ code: 'P2002' });

    await createBankAccount(prisma, first.id, { isDefault: true });
    const secondAccount = await createBankAccount(prisma, first.id, { isDefault: false });
    await expect(
      prisma.bankAccount.update({ where: { id: secondAccount.id }, data: { isDefault: true } })
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('factories default isDefault to "first under its parent"', async () => {
    const freelancer = await createFreelancer(prisma);
    const first = await createSenderProfile(prisma, freelancer.id);
    const second = await createSenderProfile(prisma, freelancer.id);
    expect([first.isDefault, second.isDefault]).toEqual([true, false]);

    const a = await createBankAccount(prisma, first.id);
    const b = await createBankAccount(prisma, first.id);
    const c = await createBankAccount(prisma, second.id);
    expect([a.isDefault, b.isDefault, c.isDefault]).toEqual([true, false, true]);
  });

  it('applies and reverts cleanly: down 04 → 01 removes indexes and column, up 01 → 04 restores them', async () => {
    expect(await versionColumn()).toHaveLength(1);

    await psql(DOWN['04']);
    await psql(DOWN['03']);
    await psql(DOWN['02']);
    await psql(DOWN['01']);
    expect(await versionColumn()).toHaveLength(0);
    for (const name of [SENDER_INDEX, BANK_INDEX, BANK_ID_INDEX]) {
      expect(await indexInfo(name), `${name} after down`).toHaveLength(0);
    }

    await psql(UP['01']);
    await psql(UP['02']);
    await psql(UP['03']);
    await psql(UP['04']);
    expect(await versionColumn()).toHaveLength(1);
    for (const name of [SENDER_INDEX, BANK_INDEX, BANK_ID_INDEX]) {
      const info = await indexInfo(name);
      expect(info, `${name} after up`).toHaveLength(1);
      expect(info[0]?.indisvalid).toBe(true);
    }
  });
});

describe.runIf(!containerRuntimeAvailable)('invoice-integrity migrations (T02, AC-18)', () => {
  it.skip('skipped: no container runtime', () => {});
});
