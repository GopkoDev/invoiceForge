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
import { createChoiceOffer, createQuestionForm } from './../support/factories/choice-offer';
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
  // T50 (revision 2026-10-13, ADR-0011): the Question form.
  '06_add_form_enum_values',
  '07_add_choice_offer_form_columns',
  '08_backfill_choice_offer_questions',
];
const UP = NAMES.map((n) => staged(`${n}.up.sql`));
const DOWN = NAMES.map((n) => staged(`${n}.down.sql`));
const OPEN_INDEX = 'ChoiceOffer_conversationId_open_key';

describe.runIf(containerRuntimeAvailable)('ai-chat-v2 migrations (T02, AC-34)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;
  let promoted = false;

  async function psql(sql: string): Promise<string> {
    const result = await db.container.exec(['psql', '-v', 'ON_ERROR_STOP=1', '-U', 'test', '-d', 'invoice_forge_test', '-c', sql]);
    if (result.exitCode !== 0) throw new Error(`psql failed: ${result.output}`);
    return result.output;
  }

  async function enumValues(type: string): Promise<string[]> {
    const rows = await prisma.$queryRawUnsafe<{ v: string }[]>(
      `SELECT e.enumlabel AS v FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = $1 ORDER BY e.enumsortorder`,
      type
    );
    return rows.map((r) => r.v);
  }

  async function nullable(table: string, column: string): Promise<boolean> {
    const rows = await prisma.$queryRawUnsafe<{ is_nullable: string }[]>(
      `SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
      table,
      column
    );
    return rows[0]?.is_nullable === 'YES';
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

  it('T50: 06–08 add FORM to both enums, questions/answers JSONB and a nullable request', async () => {
    expect(await enumValues('ChoiceOfferKind')).toEqual(['CUSTOMER', 'SENDER_PROFILE', 'CURRENCY', 'BANK_ACCOUNT', 'PRODUCT', 'FORM']);
    expect(await enumValues('MessageOrigin')).toEqual(['TYPED', 'PRESSED', 'DASHBOARD', 'FORM']);
    expect(await columnNames('ChoiceOffer')).toEqual(expect.arrayContaining(['questions', 'answers']));
    expect(await nullable('ChoiceOffer', 'request')).toBe(true);
    expect(await nullable('ChoiceOffer', 'questions')).toBe(true);
    expect(await nullable('ChoiceOffer', 'answers')).toBe(true);
  });

  it('T50: 08 backfills legacy offers into one-question forms (OPEN → no answers, CHOSEN → its option), re-run is a no-op', async () => {
    const owner = await createFreelancer(prisma);
    const conversation = await createConversation(prisma, {
      userId: owner.id,
      messages: [
        { role: 'ASSISTANT', id: 'legacy-chosen', text: 'Which one?' },
        { role: 'USER', origin: 'PRESSED', text: 'Acme GmbH' },
        { role: 'ASSISTANT', id: 'legacy-open', text: 'Which account?' },
      ],
    });
    // Pre-revision rows: written before 08 ran, so questions/answers are NULL.
    await createChoiceOffer(prisma, {
      userId: owner.id, conversationId: conversation.id, messageId: 'legacy-chosen', state: 'CHOSEN', chosenOptionId: 1,
      options: [
        { optionId: 0, label: 'Acme Corp (billing@acme.example.test)', ref: { customerId: 'fixture-acme-corp' } },
        { optionId: 1, label: 'Acme GmbH (no email)', ref: { customerId: 'fixture-acme-gmbh' } },
      ],
    });
    await createChoiceOffer(prisma, {
      userId: owner.id, conversationId: conversation.id, messageId: 'legacy-open', kind: 'PRODUCT', lineIndex: 0,
      options: [{ optionId: 0, label: 'Design · hour · 50.00 USD', ref: { productId: 'fixture-product' } }],
    });

    expect(await psql(staged('08_backfill_choice_offer_questions.up.sql'))).toContain('UPDATE 2');
    const rows = await prisma.choiceOffer.findMany({ where: { conversationId: conversation.id }, orderBy: { messageId: 'asc' } });
    const [chosen, open] = rows;
    expect(chosen.messageId).toBe('legacy-chosen');
    expect(chosen.questions).toEqual([
      {
        questionId: 0, field: 'CUSTOMER', lineIndex: null, prompt: null, input: 'NONE', required: true, skippable: false,
        matchCount: null, source: 'RESOLVER', options: chosen.options,
      },
    ]);
    expect(chosen.answers).toEqual([{ questionId: 0, optionId: 1 }]);
    expect(open.messageId).toBe('legacy-open');
    expect(open.questions).toEqual([
      expect.objectContaining({ questionId: 0, field: 'PRODUCT', lineIndex: 0, input: 'NONE', source: 'RESOLVER', options: open.options }),
    ]);
    expect(open.answers).toBeNull();

    // Idempotent: a second run touches 0 rows and changes nothing.
    expect(await psql(staged('08_backfill_choice_offer_questions.up.sql'))).toContain('UPDATE 0');
    expect(await prisma.choiceOffer.findMany({ where: { conversationId: conversation.id }, orderBy: { messageId: 'asc' } })).toEqual(rows);
  });

  it('T50: down 08 → 07 → 06 restores the pre-revision shape (FORM rows dropped, FORM messages → TYPED), then re-applies', async () => {
    const owner = await createFreelancer(prisma);
    const conversation = await createConversation(prisma, {
      userId: owner.id,
      messages: [
        { role: 'ASSISTANT', id: 'legacy-reply', text: 'Which one?' },
        { role: 'ASSISTANT', id: 'form-reply', text: 'A few questions' },
        { role: 'ASSISTANT', id: 'free-reply', text: 'Which period?' },
        { role: 'USER', origin: 'FORM', text: 'Customer: Acme GmbH' },
      ],
    });
    await createChoiceOffer(prisma, { userId: owner.id, conversationId: conversation.id, messageId: 'legacy-reply', state: 'CLOSED' });
    await psql(staged('08_backfill_choice_offer_questions.up.sql'));
    await createQuestionForm(prisma, { userId: owner.id, conversationId: conversation.id, messageId: 'form-reply', state: 'CLOSED' });
    await createQuestionForm(prisma, { userId: owner.id, conversationId: conversation.id, messageId: 'free-reply', request: null });

    await psql(staged('08_backfill_choice_offer_questions.down.sql'));
    const legacy = await prisma.choiceOffer.findUniqueOrThrow({ where: { messageId: 'legacy-reply' } });
    expect(legacy.questions).toBeNull();
    expect(legacy.answers).toBeNull();
    expect((await prisma.choiceOffer.findUniqueOrThrow({ where: { messageId: 'form-reply' } })).questions).not.toBeNull();

    await psql(staged('07_add_choice_offer_form_columns.down.sql'));
    expect(await columnNames('ChoiceOffer')).not.toContain('questions');
    expect(await columnNames('ChoiceOffer')).not.toContain('answers');
    expect(await nullable('ChoiceOffer', 'request')).toBe(false);
    expect(await count('ChoiceOffer')).toBe(2); // the free-question form (request NULL) is gone

    await psql(staged('06_add_form_enum_values.down.sql'));
    expect(await enumValues('ChoiceOfferKind')).not.toContain('FORM');
    expect(await enumValues('MessageOrigin')).not.toContain('FORM');
    const left = await prisma.$queryRawUnsafe<{ messageId: string }[]>(`SELECT "messageId" FROM "ChoiceOffer"`);
    expect(left).toEqual([{ messageId: 'legacy-reply' }]);
    const origins = await prisma.$queryRawUnsafe<{ origin: string | null }[]>(
      `SELECT origin::text AS origin FROM "ConversationMessage" WHERE "conversationId" = $1 AND role = 'USER'`,
      conversation.id
    );
    expect(origins).toEqual([{ origin: 'TYPED' }]);

    for (const name of NAMES.slice(5)) await psql(staged(`${name}.up.sql`));
    expect(await enumValues('ChoiceOfferKind')).toContain('FORM');
    expect(await enumValues('MessageOrigin')).toContain('FORM');
    expect(await nullable('ChoiceOffer', 'request')).toBe(true);
    const reapplied = await prisma.choiceOffer.findUniqueOrThrow({ where: { messageId: 'legacy-reply' } });
    expect(reapplied.questions).toEqual([expect.objectContaining({ questionId: 0, field: 'CUSTOMER', source: 'RESOLVER' })]);
  });

  it('T50: createQuestionForm writes a FORM row with the default Customer question and a "Line 1 · Price" input question', async () => {
    const owner = await createFreelancer(prisma);
    const conversation = await createConversation(prisma, {
      userId: owner.id,
      messages: [{ role: 'USER' }, { role: 'ASSISTANT', id: 'reply-form', text: 'Two questions' }],
    });
    const form = await createQuestionForm(prisma, { userId: owner.id, conversationId: conversation.id, messageId: 'reply-form' });
    expect(form.kind).toBe('FORM');
    expect(form.state).toBe('OPEN');
    expect(form.answers).toBeNull();
    expect(form.options).toEqual([]);
    const questions = form.questions as Array<{ questionId: number; field: string; heading: string; input: string; options: Array<{ label: string }> }>;
    expect(questions.map((q) => [q.questionId, q.field, q.heading, q.input])).toEqual([
      [0, 'CUSTOMER', 'Customer', 'TEXT'],
      [1, 'PRICE', 'Line 1 · Price', 'AMOUNT'],
    ]);
    expect(questions[0].options.map((o) => o.label)).toEqual(['Acme Corp', 'Acme GmbH']);
    expect(questions[1].options).toEqual([]);
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
