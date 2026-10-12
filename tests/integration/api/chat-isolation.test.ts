// T34 (ai-assistant, AC-40, AC-41; spec §6; sad §8 authorization): cross-tenant silence through POST /api/chat.
// Freelancer A asking about a Customer only B has, or posting to B's Conversation, is answered byte for byte
// like a record that never existed, and nothing of B's (ids, names, numbers, amounts) appears in A's tool
// answers, stream, saved messages or errors, for every read tool, propose_draft and Conversation ids.
// The model is a scripted stub; no network.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { MockLanguageModelV4 } from 'ai/test';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../support/db/container';
import { createTestPrismaClient } from '../../support/db/client';
import { truncateAllTables } from '../../support/db/truncate';
import { createFreelancer } from '../../support/factories/user';
import { createCustomer } from '../../support/factories/customer';
import { createSenderProfile } from '../../support/factories/sender-profile';
import { createBankAccount } from '../../support/factories/bank-account';
import { createInvoice } from '../../support/factories/invoice';
import { createConversation } from '../../support/factories/conversation';
import { partsOfText, scriptedModel } from '../../support/ai-stub-model';

const authMock = vi.fn<() => Promise<{ user: { id: string } } | null>>();
vi.mock('@/auth', () => ({ auth: () => authMock() }));

let model: MockLanguageModelV4;
vi.mock('@/lib/ai/model', () => ({ getChatModel: () => model }));

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

const TZ = 'Europe/Kyiv';

/** A drafting request: propose_draft only runs its lookup when the router reads the message as intent draft (AC-15). */
const DRAFT_VERDICT = { topic: 'in_scope', language: 'en', intent: 'draft' };

/** The text of the tool message(s) the agent model received, i.e. what the tools answered. */
function toolAnswerOf(prompt: unknown): string {
  return JSON.stringify((prompt as Array<{ role: string }>).filter((m) => m.role === 'tool'));
}

describe.runIf(containerRuntimeAvailable)('POST /api/chat cross-tenant silence (T34)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;
  let appPrisma: PrismaClient;
  let POST: (req: NextRequest) => Promise<Response>;

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    prisma = createTestPrismaClient(db.connectionString);
    ({ prisma: appPrisma } = (await import('@/prisma')) as { prisma: PrismaClient });
    ({ POST } = (await import('@/app/api/chat/route')) as { POST: (req: NextRequest) => Promise<Response> });
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await appPrisma?.$disconnect();
    await db?.stop();
  });

  beforeEach(() => {
    authMock.mockReset();
    model = scriptedModel({ steps: () => ({ text: 'ok' }) });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await truncateAllTables(prisma);
  });

  /** A (signed in) has Acme Corp only; B has Globex with an overdue invoice and a Conversation. */
  async function twoFreelancers() {
    const a = await createFreelancer(prisma, { email: 'user-1-t34@example.com', timeZone: TZ });
    const b = await createFreelancer(prisma, { email: 'user-2-t34@example.com', timeZone: TZ });
    const profileA = await createSenderProfile(prisma, a.id, { name: 'A Main' });
    await createBankAccount(prisma, profileA.id, { currency: 'USD' });
    await createCustomer(prisma, a.id, { name: 'Acme Corp' });

    const profileB = await createSenderProfile(prisma, b.id, { name: 'Zebra Studio' });
    const bankB = await createBankAccount(prisma, profileB.id, { currency: 'USD' });
    const globex = await createCustomer(prisma, b.id, { name: 'Globex', companyName: 'Globex Holdings Ltd', email: 'billing@globex-b.example.com' });
    const invoiceB = await createInvoice(prisma, {
      senderProfile: profileB,
      customer: globex,
      bankAccount: bankB,
      items: [{ name: 'Secret retainer', quantity: 1, rate: 7777.77, amount: 7777.77 }],
      overrides: {
        status: 'PENDING',
        invoiceNumber: 'GLX-4242',
        issueDate: new Date('2020-01-01T00:00:00.000Z'),
        dueDate: new Date('2020-01-15T00:00:00.000Z'),
      },
    });
    const conversationB = await createConversation(prisma, {
      userId: b.id,
      title: 'Globex renewal',
      messages: [{ role: 'USER', text: 'What does Globex owe me, invoice GLX-4242?' }],
    });
    authMock.mockResolvedValue({ user: { id: a.id } });
    const markers = [
      'Globex Holdings', 'GLX-4242', '7777', 'Secret retainer', 'Zebra Studio', 'billing@globex-b',
      globex.id, invoiceB.id, profileB.id, conversationB.id, b.id, 'user-2-t34',
    ];
    return { a, b, globex, invoiceB, profileB, conversationB, markers };
  }

  const send = (text: string, conversationId: string | null = null) =>
    POST(
      new NextRequest('http://localhost/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ conversationId, message: { id: 'msg_client_01', role: 'user', parts: [{ type: 'text', text }] } }),
      })
    );

  const everythingSavedFor = async (userId: string) =>
    JSON.stringify({
      messages: await prisma.conversationMessage.findMany({ where: { conversation: { userId } } }),
      conversations: await prisma.conversation.findMany({ where: { userId } }),
      cards: await prisma.draftCard.findMany({ where: { userId } }),
      turns: await prisma.assistantTurn.findMany({ where: { userId } }),
    });

  /** Ids and the echoed name differ between two runs; nothing else may. */
  const normalise = (text: string, echoed: string) =>
    text
      .replaceAll(echoed, '<NAME>')
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '<ID>')
      .replace(/c[a-z0-9]{24}/g, '<ID>')
      // cuid2 ids (Conversation, DraftCard) as they appear quoted in JSON.
      .replace(/"[a-z][a-z0-9]{23}"/g, '"<ID>"')
      .replace(/"messageId":"[^"]*"/g, '"messageId":"<ID>"')
      .replace(/"createdAt":\d+/g, '"createdAt":0');

  /** Compares two texts and, when they differ, names where, so a failure shows the leaking part. */
  const firstDifference = (a: string, b: string) => {
    if (a === b) return 'identical';
    let i = 0;
    while (i < a.length && a[i] === b[i]) i++;
    return `differ at ${i}: <<${a.slice(Math.max(0, i - 80), i + 160)}>> vs <<${b.slice(Math.max(0, i - 80), i + 160)}>>`;
  };

  describe('AC-40: a Customer only another Freelancer has', () => {
    const lookups = (name: string) => [
      { name: 'list_customers', input: { name } },
      { name: 'search_invoices', input: { customer: name } },
      { name: 'propose_draft', input: { customer: name, lines: [{ description: 'work', quantity: '1', unit: 'pcs', price: '10' }] } },
    ];

    async function ask(name: string, userId: string) {
      // intent draft: without it propose_draft answers NOT_REQUESTED and the cross-tenant case proves nothing (N-4).
      model = scriptedModel({
        verdict: DRAFT_VERDICT,
        steps: (i) => (i === 0 ? { toolCalls: lookups(name) } : { text: 'I cannot find that customer.' }),
      });
      await prisma.messageAllowanceDay.deleteMany({ where: { userId } });
      await prisma.conversation.deleteMany({ where: { userId } });
      await prisma.draftCard.deleteMany({ where: { userId } });
      await prisma.assistantTurn.deleteMany({ where: { userId } });
      const response = await send(`What do I know about ${name}?`);
      const text = await response.text();
      await vi.waitFor(async () => expect(await prisma.conversationMessage.count({ where: { conversation: { userId } } })).toBe(2));
      const lastPrompt = JSON.stringify(model.doStreamCalls.at(-1)!.prompt);
      const proposeAnswer = toolAnswerOf(model.doStreamCalls.at(-1)!.prompt);
      const turns = (await prisma.assistantTurn.findMany({ where: { userId } })).map((t) => ({
        topic: t.topic, outcome: t.outcome, counted: t.counted, steps: t.steps, toolNames: t.toolNames,
      }));
      return { status: response.status, text, lastPrompt, proposeAnswer, saved: await everythingSavedFor(userId), turns };
    }

    it('answers about Globex exactly as about a Customer that does not exist (stream, tool answers, saved turn, metadata)', async () => {
      const { a } = await twoFreelancers();

      const foreign = await ask('Globex', a.id);
      const unknown = await ask('Zzyzxq', a.id);

      expect(foreign.status).toBe(unknown.status);
      expect(firstDifference(normalise(foreign.text, 'Globex'), normalise(unknown.text, 'Zzyzxq'))).toBe('identical');
      expect(firstDifference(normalise(foreign.lastPrompt, 'Globex'), normalise(unknown.lastPrompt, 'Zzyzxq'))).toBe('identical');
      expect(foreign.turns).toEqual(unknown.turns);
      // propose_draft really ran (drafting intent on) and answered the same CUSTOMER_NOT_FOUND for both.
      expect(foreign.proposeAnswer).toContain('CUSTOMER_NOT_FOUND');
      expect(unknown.proposeAnswer).toContain('CUSTOMER_NOT_FOUND');
      expect(foreign.proposeAnswer).not.toContain('NOT_REQUESTED');
      expect(normalise(foreign.proposeAnswer, 'Globex')).toBe(normalise(unknown.proposeAnswer, 'Zzyzxq'));
      // No hint that it exists for someone else: none of B's details are anywhere in A's turn.
      for (const text of [foreign.text, foreign.lastPrompt, foreign.saved]) {
        expect(text).not.toContain('Globex Holdings');
        expect(text).not.toContain('GLX-4242');
        expect(text).not.toContain('7777');
        expect(text).not.toContain('Zebra Studio');
        expect(text).not.toContain('billing@globex-b');
      }
    });
  });

  describe('AC-40: nothing of B appears in A\'s turn, for every read tool and propose_draft', () => {
    type Case = [label: string, build: (ctx: { globex: { id: string }; invoiceB: { id: string }; profileB: { id: string } }) => { name: string; input: Record<string, unknown> }];
    const cases: Case[] = [
      ['list_customers by B name', () => ({ name: 'list_customers', input: { name: 'Globex' } })],
      ['list_customers with no filter', () => ({ name: 'list_customers', input: {} })],
      ['search_invoices by B customer name', () => ({ name: 'search_invoices', input: { customer: 'Globex' } })],
      ['search_invoices by B customer id', (c) => ({ name: 'search_invoices', input: { customerId: c.globex.id } })],
      ['search_invoices by B sender profile id', (c) => ({ name: 'search_invoices', input: { senderProfileId: c.profileB.id, status: ['pending', 'overdue', 'paid', 'draft', 'cancelled'] } })],
      ['search_invoices by B invoice number', () => ({ name: 'search_invoices', input: { invoiceNumber: 'GLX' } })],
      ['get_invoice by B invoice id', (c) => ({ name: 'get_invoice', input: { invoiceId: c.invoiceB.id } })],
      ['get_invoice by B invoice number', () => ({ name: 'get_invoice', input: { invoiceNumber: 'GLX-4242' } })],
      ['list_debtors', () => ({ name: 'list_debtors', input: {} })],
      ['list_overdue_invoices', () => ({ name: 'list_overdue_invoices', input: {} })],
      ['list_expected_payments', () => ({ name: 'list_expected_payments', input: {} })],
      ['get_summary_figures', () => ({ name: 'get_summary_figures', input: {} })],
      ['propose_draft for B customer', () => ({ name: 'propose_draft', input: { customer: 'Globex', lines: [{ description: 'Secret retainer', quantity: '1', unit: 'pcs', price: '7777.77' }] } })],
    ];

    it.each(cases)('%s', async (_label, build) => {
      const ctx = await twoFreelancers();
      const call = build(ctx);
      model = scriptedModel({ verdict: DRAFT_VERDICT, steps: (i) => (i === 0 ? { toolCall: call } : { text: 'Nothing found.' }) });

      const response = await send('Look this up for me');
      const text = await response.text();
      expect(response.status).toBe(200);
      // The tool ran and its answer reached the model, but never the browser (R-14).
      expect((model.doStreamCalls.at(-1)!.prompt as Array<{ role: string }>).some((m) => m.role === 'tool')).toBe(true);
      expect(partsOfText(text).filter((p) => String(p.type).startsWith('tool-'))).toEqual([]);
      await vi.waitFor(async () => expect(await prisma.assistantTurn.count({ where: { userId: ctx.a.id } })).toBe(1));

      const surfaces = {
        stream: text,
        modelPrompt: JSON.stringify(model.doStreamCalls.at(-1)!.prompt),
        saved: await everythingSavedFor(ctx.a.id),
      };
      for (const [where, content] of Object.entries(surfaces)) {
        // The scripted model's own tool input is its words, not the server's; only what the server produced counts.
        const own = JSON.stringify(call.input);
        for (const marker of ctx.markers.filter((m) => !own.includes(m)))
          expect(content, `${where} leaks ${marker}`).not.toContain(marker);
      }
      if (call.name === 'propose_draft') {
        const answer = toolAnswerOf(model.doStreamCalls.at(-1)!.prompt);
        expect(answer).toContain('CUSTOMER_NOT_FOUND');
        expect(answer).not.toContain('NOT_REQUESTED');
      }
      // B's own data is untouched.
      expect(await prisma.draftCard.count({ where: { userId: ctx.b.id } })).toBe(0);
      expect(await prisma.conversationMessage.count({ where: { conversationId: ctx.conversationB.id } })).toBe(1);
    });
  });

  describe('AC-41: a Conversation of another Freelancer', () => {
    it('answers byte for byte like a Conversation that never existed, and touches nothing', async () => {
      const { a, b, conversationB, markers } = await twoFreelancers();
      const before = await everythingSavedFor(b.id);

      const foreign = await send('Continue please', conversationB.id);
      const foreignBytes = await foreign.text();
      const unknown = await send('Continue please', 'clx0unknown00000000000001');
      const unknownBytes = await unknown.text();

      expect(foreign.status).toBe(404);
      expect(foreign.status).toBe(unknown.status);
      expect(foreignBytes).toBe(unknownBytes);
      expect(foreign.headers.get('content-type')).toBe(unknown.headers.get('content-type'));
      expect(JSON.parse(foreignBytes)).toEqual({ success: false, code: 'NOT_FOUND', error: "This conversation can't be found." });
      for (const marker of markers) expect(foreignBytes).not.toContain(marker);
      // Nothing was processed, counted or written, for either Freelancer.
      expect(model.doGenerateCalls).toHaveLength(0);
      expect(model.doStreamCalls).toHaveLength(0);
      expect(await prisma.messageAllowanceDay.count({ where: { userId: a.id } })).toBe(0);
      expect(await prisma.conversationMessage.count({ where: { conversationId: conversationB.id } })).toBe(1);
      expect(await everythingSavedFor(b.id)).toBe(before);
    });
  });
});
