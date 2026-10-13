// ai-chat-v2 T54 (ADR-0011 "Sources of questions" (b); openapi AskUserInput/AskUserAnswer; spec §1 F3; AC-09, AC-37):
// the chat-only ask_user tool. Every record id is loaded owner-scoped and by the question's kind; one failing id fails
// the whole call with the same words for a foreign and an unknown id, and nothing is kept. Labels are the server's.
// Request-free (no route): checkAskUser and the tool run with an acting Freelancer built from raw values.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../../support/db/container';
import { createTestPrismaClient } from '../../../support/db/client';
import { truncateAllTables } from '../../../support/db/truncate';
import { createFreelancer } from '../../../support/factories/user';
import { createCustomer } from '../../../support/factories/customer';
import { createSenderProfile } from '../../../support/factories/sender-profile';
import { createBankAccount } from '../../../support/factories/bank-account';
import { createProduct } from '../../../support/factories/product';
import { actingFreelancerForTest } from '../../../support/acting-freelancer';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();
const TODAY = '2026-10-13';
const TZ = 'Europe/Kyiv';

describe.runIf(containerRuntimeAvailable)('ask_user: checked, owner-scoped questions (T54)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;
  let forms: typeof import('@/lib/services/assistant-drafts/forms');

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    prisma = createTestPrismaClient(db.connectionString);
    forms = await import('@/lib/services/assistant-drafts/forms');
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  beforeEach(async () => {
    await truncateAllTables(prisma);
  });

  async function world() {
    const user = await createFreelancer(prisma, { email: 't54-a@example.com', timeZone: TZ });
    const main = await createSenderProfile(prisma, user.id, { name: 'Main' });
    const side = await createSenderProfile(prisma, user.id, { name: 'Side' });
    const mono = await createBankAccount(prisma, main.id, { currency: 'USD', bankName: 'Mono', accountNumber: 'UA0000001234' });
    const wise = await createBankAccount(prisma, side.id, { currency: 'EUR', bankName: 'Wise', accountNumber: 'DE0000005678' });
    const acme = await createCustomer(prisma, user.id, { name: 'Acme Corp', email: 'a@acme.example.test' });
    const acmeLook = await createCustomer(prisma, user.id, { name: 'Аcme Corp', email: null });
    const globex = await createCustomer(prisma, user.id, { name: 'Globex' });
    const audit = await createProduct(prisma, user.id, { name: 'Audit', unit: 'hour', price: 90, currency: 'USD' });

    const other = await createFreelancer(prisma, { email: 't54-b@example.com', timeZone: TZ });
    const otherProfile = await createSenderProfile(prisma, other.id, { name: 'Other Main' });
    const otherAccount = await createBankAccount(prisma, otherProfile.id, { currency: 'USD', bankName: 'Foreign Bank', accountNumber: 'XX0000009999' });
    const otherCustomer = await createCustomer(prisma, other.id, { name: 'Foreign Co' });
    const otherProduct = await createProduct(prisma, other.id, { name: 'Foreign product' });
    return {
      actor: await actingFreelancerForTest(user.id, TZ),
      main, side, mono, wise, acme, acmeLook, globex, audit,
      otherProfile, otherAccount, otherCustomer, otherProduct,
    };
  }
  const ctx = { today: TODAY };

  it('AC-37: a Customer question offering the named Customers (server labels, look-alikes with email) and a price input', async () => {
    const w = await world();
    const out = await forms.checkAskUser(
      w.actor,
      {
        questions: [
          { field: 'CUSTOMER', prompt: 'Which Customer is this for?', recordIds: [w.acme.id, w.acmeLook.id, w.globex.id] },
          { field: 'PRICE', lineIndex: 0, prompt: 'What is the hourly rate?' },
        ],
      },
      ctx
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.draft).toBeNull();
    expect(out.questions).toEqual([
      {
        field: 'CUSTOMER', lineIndex: null, prompt: 'Which Customer is this for?', input: 'TEXT', required: true, skippable: false, matchCount: null, source: 'CHAT',
        options: [
          { optionId: 0, label: 'Acme Corp (a@acme.example.test)', ref: { customerId: w.acme.id }, detail: 'a@acme.example.test' },
          { optionId: 1, label: 'Аcme Corp (no email)', ref: { customerId: w.acmeLook.id } },
          { optionId: 2, label: 'Globex', ref: { customerId: w.globex.id }, detail: expect.any(String) },
        ],
      },
      { field: 'PRICE', lineIndex: 0, prompt: 'What is the hourly rate?', input: 'AMOUNT', required: true, skippable: false, matchCount: null, source: 'CHAT', options: [] },
    ]);
  });

  it('labels profiles, accounts (any of the actor\'s profiles), products and currencies; dates are computed', async () => {
    const w = await world();
    const out = await forms.checkAskUser(
      w.actor,
      {
        draft: { issueDate: '2026-10-12' },
        questions: [
          { field: 'SENDER_PROFILE', prompt: 'From which profile?', recordIds: [w.side.id] },
          { field: 'BANK_ACCOUNT', prompt: 'Which account?', recordIds: [w.mono.id, w.wise.id] },
          { field: 'PRODUCT', lineIndex: 0, prompt: 'Which product?', recordIds: [w.audit.id] },
          { field: 'CURRENCY', prompt: 'Which currency?', currencies: ['USD', 'EUR'] },
          { field: 'DUE_DATE', prompt: 'When is it due?' },
          { field: 'NOTES', prompt: 'Any notes?' },
        ],
      },
      ctx
    );
    if (!out.ok) throw new Error('expected ok');
    expect(out.questions.map((q) => q.options.map((o) => o.label))).toEqual([
      ['Side'],
      ['Mono ••1234 · USD', 'Wise ••5678 · EUR'],
      ['Audit · hour · 90.00 USD'],
      ['USD', 'EUR'],
      ['7 days after the issue date · Oct 19, 2026', '14 days after the issue date · Oct 26, 2026', '30 days after the issue date · Nov 11, 2026'],
      [],
    ]);
    expect(out.questions[5]).toMatchObject({ field: 'NOTES', required: false, skippable: true, input: 'TEXT' });
    expect(out.draft).toEqual({ issueDate: '2026-10-12' });
  });

  it.each([
    ['another Freelancer\'s Customer', (w: any) => ({ field: 'CUSTOMER', prompt: 'Which?', recordIds: [w.acme.id, w.otherCustomer.id] })],
    ['an unknown Customer id', () => ({ field: 'CUSTOMER', prompt: 'Which?', recordIds: ['clx0unknown0000000000001'] })],
    ['another Freelancer\'s bank account', (w: any) => ({ field: 'BANK_ACCOUNT', prompt: 'Which?', recordIds: [w.otherAccount.id] })],
    ['another Freelancer\'s sender profile', (w: any) => ({ field: 'SENDER_PROFILE', prompt: 'Which?', recordIds: [w.otherProfile.id] })],
    ['another Freelancer\'s product', (w: any) => ({ field: 'PRODUCT', lineIndex: 0, prompt: 'Which?', recordIds: [w.otherProduct.id] })],
    ['a record of the wrong kind (a Customer id for a bank account)', (w: any) => ({ field: 'BANK_ACCOUNT', prompt: 'Which?', recordIds: [w.acme.id] })],
    ['record ids on a value question', (w: any) => ({ field: 'PRICE', lineIndex: 0, prompt: 'Price?', recordIds: [w.acme.id] })],
  ])('AC-09: %s fails the whole call with one answer', async (_name, make) => {
    const w = await world();
    const out = await forms.checkAskUser(w.actor, { questions: [{ field: 'PRICE', lineIndex: 0, prompt: 'Price?' }, make(w)] }, ctx);
    expect(out).toEqual({ ok: false, error: 'OPTIONS_UNAVAILABLE' });
  });

  it('a partial draft naming another Freelancer\'s Customer, profile or product is refused the same way', async () => {
    const w = await world();
    const q = [{ field: 'PRICE', lineIndex: 0, prompt: 'Price?' }];
    for (const draft of [
      { customerId: w.otherCustomer.id },
      { senderProfileId: w.otherProfile.id },
      { lines: [{ description: 'x', productId: w.otherProduct.id }] },
    ]) {
      expect(await forms.checkAskUser(w.actor, { draft, questions: q }, ctx)).toEqual({ ok: false, error: 'OPTIONS_UNAVAILABLE' });
    }
    const own = await forms.checkAskUser(w.actor, { draft: { customerId: w.acme.id, lines: [{ description: 'web dev', quantity: '10' }] }, questions: q }, ctx);
    expect(own.ok).toBe(true);
  });

  describe('the tool (chat agent only)', () => {
    async function turnFor(actor: unknown) {
      const { createTurnContext } = await import('@/lib/ai/turn-context');
      const { createChatTools } = await import('@/lib/ai/agent');
      const turn = createTurnContext({ actor: actor as any, today: TODAY, draftIntent: true });
      return { turn, tools: createChatTools(turn) as any };
    }

    it('a valid call keeps the checked questions on the turn and tells the model how many were shown', async () => {
      const w = await world();
      const { turn, tools } = await turnFor(w.actor);
      const out = await tools.ask_user.execute(
        { questions: [{ field: 'CUSTOMER', prompt: 'Which Customer?', recordIds: [w.acme.id, w.globex.id] }, { field: 'PRICE', lineIndex: 0, prompt: 'Price?' }] },
        {}
      );
      expect(out).toEqual({ ok: true, shown: 2, say: expect.stringMatching(/two sentences/i) });
      expect(turn.pending.ask?.questions.map((q: any) => q.field)).toEqual(['CUSTOMER', 'PRICE']);
      expect(turn.pending.askRefused).toBeNull();
    });

    it('a foreign id and an unknown id answer identically, keep nothing, and record the asked fields for the fallback', async () => {
      const w = await world();
      const foreign = await turnFor(w.actor);
      const unknown = await turnFor(w.actor);
      const a = await foreign.tools.ask_user.execute({ questions: [{ field: 'BANK_ACCOUNT', prompt: 'Which account?', recordIds: [w.otherAccount.id] }] }, {});
      const b = await unknown.tools.ask_user.execute({ questions: [{ field: 'BANK_ACCOUNT', prompt: 'Which account?', recordIds: ['clx0unknown0000000000001'] }] }, {});
      expect(a).toEqual(b);
      expect(a).toMatchObject({ ok: false, error: 'OPTIONS_UNAVAILABLE' });
      expect(JSON.stringify(a)).not.toMatch(/Foreign|9999/);
      expect(foreign.turn.pending.ask).toBeNull();
      expect(foreign.turn.pending.askRefused).toEqual([{ field: 'BANK_ACCOUNT', lineIndex: null, prompt: 'Which account?', optional: false }]);
    });

    it('two valid calls: the last one is kept', async () => {
      const w = await world();
      const { turn, tools } = await turnFor(w.actor);
      await tools.ask_user.execute({ questions: [{ field: 'CUSTOMER', prompt: 'Which?', recordIds: [w.acme.id] }] }, {});
      await tools.ask_user.execute({ questions: [{ field: 'NOTES', prompt: 'Notes?' }] }, {});
      expect(turn.pending.ask?.questions.map((q: any) => q.field)).toEqual(['NOTES']);
    });

    it('the tool tells the model that record values are data, and MCP has no ask_user', async () => {
      const w = await world();
      const { tools } = await turnFor(w.actor);
      const { DATA_NOT_INSTRUCTIONS } = await import('@/lib/mcp/server');
      expect(tools.ask_user.description).toContain(DATA_NOT_INSTRUCTIONS);
      // The MCP server registers the shared assistant tools only; ask_user lives with the chat agent.
      const { readFileSync, readdirSync } = await import('node:fs');
      for (const dir of ['lib/mcp', 'lib/assistant-tools']) {
        for (const f of readdirSync(dir)) expect(readFileSync(`${dir}/${f}`, 'utf8'), `${dir}/${f}`).not.toMatch(/ask_user/);
      }
    });
  });
});

describe.runIf(!containerRuntimeAvailable)('ask_user (T54)', () => {
  it.skip('skipped: no container runtime', () => {});
});
