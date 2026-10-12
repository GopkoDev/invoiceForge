// ai-chat-v2 T02 (AC-34): the five staged migrations promoted into prisma/migrations/. Apply, backfill, revert,
// re-apply; one OPEN offer per Conversation; account deletion leaves no ChoiceOffer row; no Prisma drift.
// docs/features/ai-chat-v2/tasks/t02-promote-migrations-and-factories.md, data-model.md §Prisma schema edits.
//
// `prisma migrate deploy` (startTestDatabase) applies the promoted copies. The down files stay in the staged
// folder, so the revert test runs them (and the ups) through psql. Throwaway container only, never .env.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from './../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from './../support/db/container';
import { createTestPrismaClient } from './../support/db/client';
import { assertNotEnvDatabase } from './../support/db/env-guard';
import { truncateAllTables } from './../support/db/truncate';
import { createFreelancer } from './../support/factories/user';
import { createConversation } from './../support/factories/conversation';
import { createChoiceOffer } from './../support/factories/choice-offer';
import { createSenderProfile } from './../support/factories/sender-profile';
import { createCustomer } from './../support/factories/customer';
import { createBankAccount } from './../support/factories/bank-account';
import { createInvoice } from './../support/factories/invoice';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

const STAGED_DIR = path.resolve(process.cwd(), 'docs/features/ai-chat-v2/migrations');
const staged = (name: string) => fs.readFileSync(path.join(STAGED_DIR, name), 'utf8');

const NAMES = [
  '01_create_choice_offer',
  '02_add_conversation_message_origin',
  '03_backfill_conversation_message_origin',
  '04_add_conversation_started_from',
  '05_add_invoice_issued_from_chat',
];
const UP = NAMES.map((n) => staged(`${n}.up.sql`));
const DOWN = NAMES.map((n) => staged(`${n}.down.sql`));
const OPEN_INDEX = 'ChoiceOffer_conversationId_open_key';

describe.runIf(containerRuntimeAvailable)('ai-chat-v2 migrations (T02, AC-34)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;
  let promoted = false;

  async function psql(sql: string): Promise<void> {
    const result = await db.container.exec(['psql', '-v', 'ON_ERROR_STOP=1', '-U', 'test', '-d', 'invoice_forge_test', '-c', sql]);
    if (result.exitCode !== 0) throw new Error(`psql failed: ${result.output}`);
  }

  async function tableExists(name: string): Promise<boolean> {
    const rows = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ${name}`;
    return Number(rows[0]?.n ?? 0) > 0;
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
      SELECT ix.indisvalid FROM pg_index ix JOIN pg_class ic ON ic.oid = ix.indexrelid WHERE ic.relname = ${name}`;
    return rows.map((r) => r.indisvalid);
  }

  async function count(table: string): Promise<number> {
    const rows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM "${table}"`);
    return Number(rows[0]?.n ?? 0);
  }

  async function insertOffer(userId: string, conversationId: string, messageId: string, id: string, state: string) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "ChoiceOffer" (id, "userId", "conversationId", "messageId", kind, request, options, state, "updatedAt")
       VALUES ($1, $2, $3, $4, 'CUSTOMER', '{}'::jsonb, '[]'::jsonb, $5::"ChoiceOfferState", now())`,
      id, userId, conversationId, messageId, state
    );
  }

  /** A first-iteration Conversation: one typed USER message and one ASSISTANT reply. */
  async function firstIterationConversation(userId: string) {
    return createConversation(prisma, {
      userId,
      messages: [
        { role: 'USER', text: 'Invoice Acme Corp for 20 hours' },
        { role: 'ASSISTANT', text: 'Which Acme do you mean?' },
      ],
    });
  }

  beforeAll(async () => {
    db = await startTestDatabase(); // `prisma migrate deploy` over prisma/migrations/
    prisma = createTestPrismaClient(db.connectionString);
    promoted = await tableExists('ChoiceOffer');
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  beforeEach(async () => {
    expect(promoted, 'expected `prisma migrate deploy` (prisma/migrations/) to create ChoiceOffer').toBe(true);
    await truncateAllTables(prisma);
  });

  it('promoted migrations create ChoiceOffer, its indexes and the three new columns', async () => {
    expect(await columnNames('ChoiceOffer')).toEqual(
      expect.arrayContaining(['id', 'userId', 'conversationId', 'messageId', 'kind', 'lineIndex', 'request', 'options', 'state', 'chosenOptionId', 'createdAt', 'updatedAt'])
    );
    expect(await indexValid(OPEN_INDEX)).toEqual([true]);
    expect(await indexValid('ChoiceOffer_messageId_key')).toEqual([true]);
    expect(await indexValid('ChoiceOffer_conversationId_idx')).toEqual([true]);
    expect(await indexValid('ChoiceOffer_userId_idx')).toEqual([true]);
    expect(await columnNames('ConversationMessage')).toContain('origin');
    expect(await columnNames('Conversation')).toContain('startedFrom');
    expect(await columnNames('Invoice')).toContain('issuedFromChat');
  });

  it('applies over first-iteration data, backfills TYPED on USER rows, reverts 05 → 01 and re-applies idempotently', async () => {
    const owner = await createFreelancer(prisma);
    const profile = await createSenderProfile(prisma, owner.id);
    const customer = await createCustomer(prisma, owner.id);
    const bank = await createBankAccount(prisma, profile.id);
    const invoice = await createInvoice(prisma, { senderProfile: profile, customer, bankAccount: bank });
    const conversation = await firstIterationConversation(owner.id);

    for (const sql of [...DOWN].reverse()) await psql(sql);
    expect(await tableExists('ChoiceOffer')).toBe(false);
    expect(await columnNames('ConversationMessage')).not.toContain('origin');
    expect(await columnNames('Conversation')).not.toContain('startedFrom');
    expect(await columnNames('Invoice')).not.toContain('issuedFromChat');

    for (const sql of UP) await psql(sql);
    const messages = await prisma.$queryRawUnsafe<{ role: string; origin: string | null }[]>(
      `SELECT role::text, origin::text FROM "ConversationMessage" WHERE "conversationId" = $1 ORDER BY position`,
      conversation.id
    );
    expect(messages).toEqual([
      { role: 'USER', origin: 'TYPED' },
      { role: 'ASSISTANT', origin: null },
    ]);
    const conversations = await prisma.$queryRawUnsafe<{ startedFrom: string }[]>(
      `SELECT "startedFrom"::text AS "startedFrom" FROM "Conversation" WHERE id = $1`,
      conversation.id
    );
    expect(conversations).toEqual([{ startedFrom: 'AI_SECTION' }]);
    const invoices = await prisma.$queryRawUnsafe<{ issuedFromChat: boolean }[]>(
      `SELECT "issuedFromChat" FROM "Invoice" WHERE id = $1`,
      invoice.id
    );
    expect(invoices).toEqual([{ issuedFromChat: false }]);
    expect(await indexValid(OPEN_INDEX)).toEqual([true]);

    for (const sql of UP) await psql(sql); // idempotent DDL, no second object
    expect(await indexValid(OPEN_INDEX)).toEqual([true]);
    expect(await tableExists('ChoiceOffer')).toBe(true);
  });

  it('refuses a second OPEN offer in one Conversation, but allows CHOSEN and CLOSED beside it', async () => {
    const owner = await createFreelancer(prisma);
    const conversation = await createConversation(prisma, {
      userId: owner.id,
      messages: [
        { role: 'ASSISTANT', id: 'reply-1', text: 'Which one?' },
        { role: 'ASSISTANT', id: 'reply-2', text: 'Which one?' },
        { role: 'ASSISTANT', id: 'reply-3', text: 'Which one?' },
        { role: 'ASSISTANT', id: 'reply-4', text: 'Which one?' },
      ],
    });
    await insertOffer(owner.id, conversation.id, 'reply-1', 'offer-closed', 'CLOSED');
    await insertOffer(owner.id, conversation.id, 'reply-2', 'offer-chosen', 'CHOSEN');
    await insertOffer(owner.id, conversation.id, 'reply-3', 'offer-open', 'OPEN');
    await expect(insertOffer(owner.id, conversation.id, 'reply-4', 'offer-open-2', 'OPEN')).rejects.toThrow(
      /ChoiceOffer_conversationId_open_key|unique|duplicate/i
    );
  });

  it('factories write the new fields: startedFrom, per-message origin and id, issuedFromChat and a default offer', async () => {
    const owner = await createFreelancer(prisma);
    const conversation = await createConversation(prisma, {
      userId: owner.id,
      startedFrom: 'DASHBOARD_PROMPT',
      messages: [
        { role: 'USER', origin: 'DASHBOARD', text: 'Invoice Acme' },
        { role: 'ASSISTANT', id: 'reply-x', text: 'Which Acme?' },
      ],
    });
    expect(conversation.startedFrom).toBe('DASHBOARD_PROMPT');
    expect(conversation.messages.map((m) => [m.role, m.origin])).toEqual([
      ['USER', 'DASHBOARD'],
      ['ASSISTANT', null],
    ]);

    const defaults = await createConversation(prisma, { userId: owner.id, messages: [{ role: 'USER' }] });
    expect(defaults.startedFrom).toBe('AI_SECTION');
    expect(defaults.messages[0].origin).toBe('TYPED');

    const offer = await createChoiceOffer(prisma, { userId: owner.id, conversationId: conversation.id, messageId: 'reply-x' });
    expect(offer.kind).toBe('CUSTOMER');
    expect(offer.state).toBe('OPEN');
    expect((offer.options as Array<{ label: string }>).map((o) => o.label)).toEqual([
      'Acme Corp (billing@acme.example.test)',
      'Acme GmbH (no email)',
    ]);

    const profile = await createSenderProfile(prisma, owner.id);
    const customer = await createCustomer(prisma, owner.id);
    const bank = await createBankAccount(prisma, profile.id);
    const invoice = await createInvoice(prisma, { senderProfile: profile, customer, bankAccount: bank, overrides: { issuedFromChat: true } });
    expect(invoice.issuedFromChat).toBe(true);
  });

  it('account deletion (invoices first, then the user) leaves no ChoiceOffer row (AC-34)', async () => {
    const owner = await createFreelancer(prisma);
    const conversation = await createConversation(prisma, {
      userId: owner.id,
      messages: [{ role: 'USER' }, { role: 'ASSISTANT', id: 'reply-del', text: 'Which one?' }],
    });
    await createChoiceOffer(prisma, { userId: owner.id, conversationId: conversation.id, messageId: 'reply-del', state: 'CHOSEN', chosenOptionId: 2 });

    await prisma.user.delete({ where: { id: owner.id } });

    expect(await count('ChoiceOffer')).toBe(0);
    expect(await count('ConversationMessage')).toBe(0);
  });

  it('prisma migrate diff between the migrated database and prisma/schema stays empty (no drift)', () => {
    assertNotEnvDatabase(db.connectionString);
    expect(() =>
      execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'diff', '--from-config-datasource', '--to-schema', 'prisma/schema', '--exit-code'], {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: db.connectionString },
        stdio: 'pipe',
      })
    ).not.toThrow();
  });
});

describe.runIf(!containerRuntimeAvailable)('ai-chat-v2 migrations (T02, AC-34)', () => {
  it.skip('skipped: no container runtime', () => {});
});
