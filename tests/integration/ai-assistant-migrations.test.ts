// ai-assistant T01 - the ten AI migrations: apply, revert, re-apply, read-only legacy keys (AC-26),
// one LIVE card per Conversation, and account deletion leaving no AI row (AC-39).
// docs/features/ai-assistant/tasks/t01-promote-migrations-and-test-support.md,
// data-model.md §Mode + §Prisma schema edits.
//
// `prisma migrate deploy` (startTestDatabase) applies the promoted copies in prisma/migrations/. The
// down files stay in the staged folder, so the revert test runs them (and the ups) through psql. Rows
// are inserted with raw SQL so this file does not depend on the not-yet-generated Prisma models.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../support/db/container';
import { createTestPrismaClient } from '../support/db/client';
import { truncateAllTables } from '../support/db/truncate';
import { createFreelancer } from '../support/factories/user';
import { createPersonalKey } from '../support/factories/personal-key';
import { createSenderProfile } from '../support/factories/sender-profile';
import { createCustomer } from '../support/factories/customer';
import { createBankAccount } from '../support/factories/bank-account';
import { createInvoice } from '../support/factories/invoice';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

const STAGED_DIR = path.resolve(process.cwd(), 'docs/features/ai-assistant/migrations');
const staged = (name: string) => fs.readFileSync(path.join(STAGED_DIR, name), 'utf8');

const NAMES = [
  '01_create_conversation',
  '02_create_draft_card',
  '03_create_message_allowance_day',
  '04_create_assistant_turn',
  '05_add_personal_key_can_create_drafts',
  '06_create_personal_key_draft_day',
  '07_create_mcp_draft_repeat',
  '08_add_invoice_assistant_origin',
  '09_add_invoice_issued_at',
  '10_create_invoice_assistant_key_id_index',
];
const UP = NAMES.map((n) => staged(`${n}.up.sql`));
const DOWN = NAMES.map((n) => staged(`${n}.down.sql`));

const AI_TABLES = [
  'Conversation',
  'ConversationMessage',
  'DraftCard',
  'MessageAllowanceDay',
  'AssistantTurn',
  'PersonalKeyDraftDay',
  'McpDraftRepeat',
];
const LIVE_INDEX = 'DraftCard_conversationId_live_key';
const KEY_INDEX = 'Invoice_assistantKeyId_idx';

describe.runIf(containerRuntimeAvailable)('ai-assistant migrations (T01, AC-26, AC-39)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;
  let promotedTables: string[] = [];

  async function psql(sql: string): Promise<void> {
    const result = await db.container.exec([
      'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'test', '-d', 'invoice_forge_test', '-c', sql,
    ]);
    if (result.exitCode !== 0) throw new Error(`psql failed: ${result.output}`);
  }

  async function tablesPresent(): Promise<string[]> {
    const rows = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`;
    const present = new Set(rows.map((r) => r.table_name));
    return AI_TABLES.filter((t) => present.has(t));
  }

  async function columnNames(table: string): Promise<string[]> {
    const rows = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
      table
    );
    return rows.map((r) => r.column_name);
  }

  async function indexValid(name: string): Promise<boolean[]> {
    const rows = await prisma.$queryRaw<{ indisvalid: boolean }[]>`
      SELECT ix.indisvalid FROM pg_index ix JOIN pg_class ic ON ic.oid = ix.indexrelid
      WHERE ic.relname = ${name}`;
    return rows.map((r) => r.indisvalid);
  }

  async function insertConversation(userId: string, id: string) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "Conversation" (id, "userId", title, "lastMessageAt", "updatedAt")
       VALUES ($1, $2, 'Test conversation', now(), now())`,
      id, userId
    );
  }

  async function insertCard(userId: string, conversationId: string, id: string, state: string, invoiceId: string | null = null) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "DraftCard" (id, "userId", "conversationId", state, request, proposal, "invoiceId", "updatedAt")
       VALUES ($1, $2, $3, $4::"DraftCardState", '{}'::jsonb, '{}'::jsonb, $5, now())`,
      id, userId, conversationId, state, invoiceId
    );
  }

  async function count(table: string): Promise<number> {
    const rows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM "${table}"`);
    return Number(rows[0]?.n ?? 0);
  }

  beforeAll(async () => {
    db = await startTestDatabase(); // `prisma migrate deploy` over prisma/migrations/
    prisma = createTestPrismaClient(db.connectionString);
    // Snapshot before any test replays the staged SQL by hand: only promoted migrations count.
    promotedTables = await tablesPresent();
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  beforeEach(async () => {
    expect(
      promotedTables,
      'expected `prisma migrate deploy` (prisma/migrations/) to create all seven AI tables before any test runs'
    ).toHaveLength(AI_TABLES.length);
    await truncateAllTables(prisma);
  });

  it('promoted migrations create the seven AI tables, the new columns and both indexes', async () => {
    expect(await tablesPresent(), 'expected `prisma migrate deploy` to create the AI tables').toEqual(
      expect.arrayContaining(AI_TABLES)
    );
    expect(await columnNames('PersonalKey')).toContain('canCreateDrafts');
    expect(await columnNames('Invoice')).toEqual(
      expect.arrayContaining(['assistantOrigin', 'assistantKeyName', 'assistantKeyId', 'issuedAt'])
    );
    expect(await indexValid(LIVE_INDEX)).toEqual([true]);
    expect(await indexValid(KEY_INDEX)).toEqual([true]);
  });

  it('applies, reverts and re-applies cleanly: down 10 → 01 removes everything, up 01 → 10 restores it, re-running is a no-op', async () => {
    for (const sql of [...DOWN].reverse()) await psql(sql);
    expect(await tablesPresent()).toEqual([]);
    expect(await columnNames('PersonalKey')).not.toContain('canCreateDrafts');
    expect(await columnNames('Invoice')).not.toContain('issuedAt');
    expect(await indexValid(KEY_INDEX)).toEqual([]);

    for (const sql of UP) await psql(sql);
    expect((await tablesPresent()).sort()).toEqual([...AI_TABLES].sort());
    expect(await indexValid(LIVE_INDEX)).toEqual([true]);
    expect(await indexValid(KEY_INDEX)).toEqual([true]);

    for (const sql of UP) await psql(sql); // idempotent DDL
    expect((await tablesPresent()).sort()).toEqual([...AI_TABLES].sort());
  });

  it('a key created before migration 05 reads canCreateDrafts = false; Invoice origin columns and issuedAt stay NULL (AC-26)', async () => {
    // The rows exist before 05 is applied: they are created, then 10 → 05 is reverted (dropping the
    // new columns) and re-applied, so 05–09 add the columns to rows that predate them. The generated
    // client cannot write to the reverted schema, so the rows are created first.
    const owner = await createFreelancer(prisma);
    const { row: legacyKey } = await createPersonalKey(prisma, owner.id);
    const profile = await createSenderProfile(prisma, owner.id);
    const customer = await createCustomer(prisma, owner.id);
    const bank = await createBankAccount(prisma, profile.id);
    const invoice = await createInvoice(prisma, { senderProfile: profile, customer, bankAccount: bank });

    for (const sql of DOWN.slice(4).reverse()) await psql(sql);
    expect(await columnNames('PersonalKey')).not.toContain('canCreateDrafts');
    expect(await columnNames('Invoice')).not.toContain('issuedAt');
    for (const sql of UP.slice(4)) await psql(sql);

    const keys = await prisma.$queryRawUnsafe<{ canCreateDrafts: boolean }[]>(
      `SELECT "canCreateDrafts" FROM "PersonalKey" WHERE id = $1`, legacyKey.id
    );
    expect(keys).toEqual([{ canCreateDrafts: false }]);

    const invoices = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT "assistantOrigin", "assistantKeyName", "assistantKeyId", "issuedAt" FROM "Invoice" WHERE id = $1`,
      invoice.id
    );
    expect(invoices).toEqual([
      { assistantOrigin: null, assistantKeyName: null, assistantKeyId: null, issuedAt: null },
    ]);
  });

  it('refuses a second LIVE card in one Conversation with a unique violation, but allows other states', async () => {
    const owner = await createFreelancer(prisma);
    await insertConversation(owner.id, 'conv-1');
    await insertCard(owner.id, 'conv-1', 'card-live', 'LIVE');
    await insertCard(owner.id, 'conv-1', 'card-old', 'REPLACED');
    await expect(insertCard(owner.id, 'conv-1', 'card-live-2', 'LIVE')).rejects.toThrow(
      /DraftCard_conversationId_live_key|unique|duplicate/i
    );
  });

  it('deleting an invoice sets DraftCard / McpDraftRepeat links to NULL; deleting a Conversation cascades messages and cards (edge cases)', async () => {
    const owner = await createFreelancer(prisma);
    const { row: key } = await createPersonalKey(prisma, owner.id);
    const profile = await createSenderProfile(prisma, owner.id);
    const customer = await createCustomer(prisma, owner.id);
    const bank = await createBankAccount(prisma, profile.id);
    const invoice = await createInvoice(prisma, { senderProfile: profile, customer, bankAccount: bank });

    await insertConversation(owner.id, 'conv-1');
    await insertCard(owner.id, 'conv-1', 'card-created', 'CREATED', invoice.id);
    await prisma.$executeRawUnsafe(
      `INSERT INTO "McpDraftRepeat" ("personalKeyId", "repeatKey", fingerprint, "invoiceId") VALUES ($1, 'r1', 'fp', $2)`,
      key.id, invoice.id
    );
    await prisma.invoice.delete({ where: { id: invoice.id } });

    const card = await prisma.$queryRawUnsafe<{ invoiceId: string | null }[]>(`SELECT "invoiceId" FROM "DraftCard"`);
    const mark = await prisma.$queryRawUnsafe<{ invoiceId: string | null }[]>(`SELECT "invoiceId" FROM "McpDraftRepeat"`);
    expect(card).toEqual([{ invoiceId: null }]);
    expect(mark).toEqual([{ invoiceId: null }]);

    await prisma.$executeRawUnsafe(`DELETE FROM "Conversation" WHERE id = 'conv-1'`);
    expect(await count('DraftCard')).toBe(0);
  });

  it('account deletion (invoices first, then the user) leaves no AI row (AC-39)', async () => {
    const owner = await createFreelancer(prisma);
    const { row: key } = await createPersonalKey(prisma, owner.id);
    const profile = await createSenderProfile(prisma, owner.id);
    const customer = await createCustomer(prisma, owner.id);
    const bank = await createBankAccount(prisma, profile.id);
    const invoice = await createInvoice(prisma, { senderProfile: profile, customer, bankAccount: bank });
    await prisma.$executeRawUnsafe(
      `UPDATE "Invoice" SET "assistantOrigin" = 'PERSONAL_KEY', "assistantKeyName" = $2, "assistantKeyId" = $3 WHERE id = $1`,
      invoice.id, key.name, key.id
    );

    await insertConversation(owner.id, 'conv-1');
    await prisma.$executeRawUnsafe(
      `INSERT INTO "ConversationMessage" (id, "conversationId", position, role, parts)
       VALUES ('msg-1', 'conv-1', 0, 'USER', '[]'::jsonb)`
    );
    await insertCard(owner.id, 'conv-1', 'card-1', 'CREATED', invoice.id);
    await prisma.$executeRawUnsafe(
      `INSERT INTO "MessageAllowanceDay" ("userId", day, used, "timeZone", "firstMessageAt") VALUES ($1, now(), 1, 'UTC', now())`,
      owner.id
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO "AssistantTurn" (id, "userId", "conversationId", outcome, counted, "durationMs")
       VALUES ('turn-1', $1, 'conv-1', 'ANSWERED', true, 10)`,
      owner.id
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO "PersonalKeyDraftDay" ("personalKeyId", day) VALUES ($1, now())`, key.id
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO "McpDraftRepeat" ("personalKeyId", "repeatKey", fingerprint, "invoiceId") VALUES ($1, 'r1', 'fp', $2)`,
      key.id, invoice.id
    );

    await prisma.$transaction([
      prisma.invoice.deleteMany({ where: { senderProfile: { userId: owner.id } } }),
      prisma.user.delete({ where: { id: owner.id } }),
    ]);

    for (const table of AI_TABLES) {
      expect(await count(table), `${table} rows after account deletion`).toBe(0);
    }
  });
});

describe.runIf(!containerRuntimeAvailable)('ai-assistant migrations (T01, AC-26, AC-39)', () => {
  it.skip('skipped: no container runtime', () => {});
});
