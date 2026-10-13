// T57 (ai-chat-v2 revision 2026-10-13; AC-08, AC-08b, AC-10, AC-11, AC-12b, AC-13, AC-14, AC-29, AC-36, AC-38, AC-39;
// ADR-0011 "Submit"; sad.md §5 "Revision 2026-10-13", Submit order). This is the T14 press-path suite rewritten for
// forms (git mv from ai-chat-v2-press.test.ts): POST /api/chat with a `form`. Order: session, body, Conversation owner,
// checkForm (409 / 400 / 503, all before the allowance and the model), reserve slot + claim with the answers (429 / 409),
// message composed from the STORED labels and typed text (the client's text is ignored), draft answers pinned and
// resolved in code, saveTurn with origin FORM. The model is the scripted stand-in; its call count is asserted.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { APICallError } from 'ai';
import type { MockLanguageModelV4 } from 'ai/test';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from './../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from './../support/db/container';
import { createTestPrismaClient } from './../support/db/client';
import { truncateAllTables } from './../support/db/truncate';
import { createFreelancer } from './../support/factories/user';
import { createCustomer } from './../support/factories/customer';
import { createSenderProfile } from './../support/factories/sender-profile';
import { createBankAccount } from './../support/factories/bank-account';
import { createProduct } from './../support/factories/product';
import { createConversation } from './../support/factories/conversation';
import { createQuestionForm, type FixtureFormQuestion } from './../support/factories/choice-offer';
import { partsOfText, scriptedModel, type StubStep } from './../support/ai-stub-model';

const authMock = vi.fn<() => Promise<{ user: { id: string } } | null>>();
vi.mock('@/auth', () => ({ auth: () => authMock() }));

let model: MockLanguageModelV4;
vi.mock('@/lib/ai/model', () => ({ getChatModel: () => model }));

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

const TZ = 'Europe/Kyiv';
const LINES = [{ description: 'Consulting', quantity: '20', price: '50' }];
const REQUEST = { customer: 'Acme', currency: 'USD', lines: LINES };
const UNAVAILABLE_BODY = {
  success: false,
  code: 'CONFLICT',
  error: 'This form is no longer available. Answer the latest questions or type your request.',
  details: { kind: 'CHOICE_UNAVAILABLE' },
};
const AMOUNT_MESSAGE = 'Enter a number greater than 0, with at most 2 decimals.';

type Answer = { questionId: number; optionId: number } | { questionId: number; text: string } | { questionId: number; skipped: true };

describe.runIf(containerRuntimeAvailable)('a sent Question form is a counted message that refers to exactly the records picked (T57)', () => {
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
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await truncateAllTables(prisma);
  });

  /** Installs a fresh scripted model, so its call counts start at zero for the phase under test. */
  let prompts: any[] = [];
  function script(step: (i: number) => StubStep) {
    prompts = [];
    model = scriptedModel({
      verdict: { topic: 'in_scope', language: 'en', intent: 'draft' },
      steps: (i, prompt) => {
        prompts.push(prompt);
        return step(i);
      },
    });
  }
  const propose = (customer: string, currency = 'USD') => (i: number): StubStep =>
    i === 0
      ? { toolCall: { name: 'propose_draft', input: { customer, currency, lines: LINES } } }
      : { text: 'Which one do you mean?' };
  const textOnly = (text = 'Here is the draft.') => () => ({ text }) as StubStep;
  const streamCalls = () => model.doStreamCalls.length;
  const noModelCalls = () => {
    expect(model.doStreamCalls).toHaveLength(0);
    expect(model.doGenerateCalls).toHaveLength(0);
  };

  async function post(body: unknown) {
    return POST(
      new NextRequest('http://localhost/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
    );
  }
  const typed = (text: string, extra: Record<string, unknown> = {}, conversationId: string | null = null) => ({
    conversationId,
    message: { id: 'msg_client_01', role: 'user', parts: [{ type: 'text', text }] },
    ...extra,
  });
  const formBody = (conversationId: string | null, formId: string, answers: Answer[], text = 'something else') =>
    typed(text, { form: { formId, answers } }, conversationId);

  async function sendTyped(text: string, extra: Record<string, unknown> = {}, conversationId: string | null = null) {
    const response = await post(typed(text, extra, conversationId));
    return partsOfText(await response.text());
  }
  /** Sends a form and consumes the streamed body, so the turn is saved before any database assertion. */
  async function sendForm(conversationId: string | null, formId: string, answers: Answer[], text?: string) {
    const response = await post(formBody(conversationId, formId, answers, text));
    const raw = await response.text();
    return { response, raw, parts: response.status === 200 ? partsOfText(raw) : [] };
  }

  async function freelancer(email: string) {
    const user = await createFreelancer(prisma, { email, timeZone: TZ });
    authMock.mockResolvedValue({ user: { id: user.id } });
    return user;
  }
  /** Default account EUR, two USD accounts (SEVERAL_ACCOUNTS_IN_CURRENCY for a USD invoice). */
  async function profileWithAccounts(userId: string) {
    const profile = await createSenderProfile(prisma, userId, { name: 'Main' });
    await createBankAccount(prisma, profile.id, { currency: 'EUR', bankName: 'Euro Bank', accountNumber: '5555555555' });
    const alpha = await createBankAccount(prisma, profile.id, { currency: 'USD', bankName: 'Alpha Bank', accountNumber: '1111111111' });
    const beta = await createBankAccount(prisma, profile.id, { currency: 'USD', bankName: 'Beta Bank', accountNumber: '2222222222' });
    return { profile, alpha, beta };
  }
  /** One USD account on the default profile: once the Customer is pinned, the draft is complete. */
  async function profileWithOneUsdAccount(userId: string) {
    const profile = await createSenderProfile(prisma, userId, { name: 'Main' });
    const usd = await createBankAccount(prisma, profile.id, { currency: 'USD', bankName: 'Alpha Bank', accountNumber: '1111111111' });
    return { profile, usd };
  }
  async function acmePair(userId: string) {
    const corp = await createCustomer(prisma, userId, { name: 'Acme Corp', email: 'billing@acme-corp.example.test' });
    const gmbh = await createCustomer(prisma, userId, { name: 'Acme GmbH', email: 'billing@acme-gmbh.example.test' });
    return { corp, gmbh };
  }

  const used = async (userId: string) => (await prisma.messageAllowanceDay.findFirst({ where: { userId } }))?.used ?? 0;
  const latestOpenForm = async () => prisma.choiceOffer.findFirstOrThrow({ where: { state: 'OPEN' }, orderBy: { createdAt: 'desc' } });
  const formRow = (id: string) => prisma.choiceOffer.findUniqueOrThrow({ where: { id } });
  const lastUserMessage = () => prisma.conversationMessage.findFirstOrThrow({ where: { role: 'USER' }, orderBy: { position: 'desc' } });
  const conversationOf = async () => (await prisma.conversation.findFirstOrThrow()).id;
  const onlyCard = async () => {
    const cards = await prisma.draftCard.findMany();
    expect(cards).toHaveLength(1);
    return cards[0].proposal as any;
  };
  const optionIdOf = (form: { questions: unknown }, field: string, match: (o: any) => boolean) => {
    const question = (form.questions as any[]).find((x) => x.field === field);
    const option = question.options.find(match);
    return { questionId: question.questionId as number, optionId: option.optionId as number };
  };

  // ---------- fixtures: forms stored directly, with the exact shape the typed turn stores (T55) ----------
  const q = (o: Partial<FixtureFormQuestion> & Pick<FixtureFormQuestion, 'questionId' | 'field' | 'heading'>): FixtureFormQuestion => ({
    lineIndex: null,
    prompt: null,
    options: [],
    input: 'TEXT',
    required: true,
    skippable: false,
    matchCount: null,
    source: 'RESOLVER',
    ...o,
  });
  const customerQuestion = (customers: Array<{ id: string; label: string }>, questionId = 0): FixtureFormQuestion =>
    q({
      questionId,
      field: 'CUSTOMER',
      heading: 'Customer',
      options: customers.map((c, i) => ({ optionId: i, label: c.label, ref: { customerId: c.id } })),
    });
  const accountQuestion = (accounts: Array<{ id: string; label: string }>, questionId: number): FixtureFormQuestion =>
    q({
      questionId,
      field: 'BANK_ACCOUNT',
      heading: 'Bank account',
      options: accounts.map((a, i) => ({ optionId: i, label: a.label, ref: { bankAccountId: a.id } })),
    });
  const priceQuestion = (questionId: number): FixtureFormQuestion =>
    q({ questionId, field: 'PRICE', lineIndex: 0, heading: 'Line 1 · Price', input: 'AMOUNT', source: 'CHAT' });

  /** A Conversation whose latest reply holds the form (an OPEN row by default). */
  async function seedForm(
    userId: string,
    opts: { questions: FixtureFormQuestion[]; request?: Record<string, unknown> | null; state?: 'OPEN' | 'CHOSEN' | 'CLOSED'; conversationId?: string }
  ) {
    const messageId = `msg_${Math.random().toString(36).slice(2, 12)}`;
    const formId = `frm_${Math.random().toString(36).slice(2, 12)}`;
    const replyParts = [
      { type: 'text', text: 'A few questions first.' },
      { type: 'data-offer', id: formId, data: { offerId: formId } },
    ];
    let conversationId: string;
    if (opts.conversationId) {
      // A newer reply in an existing Conversation (the reply the older form belongs to is not the latest any more).
      conversationId = opts.conversationId;
      const count = await prisma.conversationMessage.count({ where: { conversationId } });
      await prisma.conversationMessage.createMany({
        data: [
          { conversationId, position: count, role: 'USER', origin: 'TYPED', parts: [{ type: 'text', text: 'and then?' }] },
          { id: messageId, conversationId, position: count + 1, role: 'ASSISTANT', parts: replyParts as never },
        ],
      });
    } else {
      const conversation = await createConversation(prisma, {
        userId,
        messages: [{ role: 'USER' }, { role: 'ASSISTANT', id: messageId, parts: replyParts as never }],
      });
      conversationId = conversation.id;
    }
    const messageRow = messageId;
    const form = await createQuestionForm(prisma, {
      id: formId,
      userId,
      conversationId,
      messageId: messageRow,
      questions: opts.questions,
      request: opts.request === undefined ? (REQUEST as never) : (opts.request as never),
      state: opts.state,
    });
    return { conversationId, form };
  }

  /** Makes the allowance row (one throwaway typed message in its own Conversation), then sets how many are used. */
  async function primeAllowance(userId: string, usedNow: number) {
    script(textOnly('Hello.'));
    await sendTyped('hello');
    await prisma.messageAllowanceDay.updateMany({ where: { userId }, data: { used: usedNow } });
  }

  /** A first typed turn through the route: leaves a saved Conversation with one OPEN Question form on its latest reply. */
  async function firstTurnWithForm(customer = 'Acme', currency = 'USD') {
    script(propose(customer, currency));
    await sendTyped('invoice Acme for 20 hours at $50');
    return { conversationId: await conversationOf(), form: await latestOpenForm() };
  }

  describe('AC-08: picking a Customer and pressing Send', () => {
    it('AC-08: Send with "Acme GmbH" saves "Customer: Acme GmbH" (origin FORM), marks the form CHOSEN with the answers, counts one slot and shows the card for exactly that Customer; the client text is ignored', async () => {
      const user = await freelancer('t57-ac08@example.com');
      await profileWithOneUsdAccount(user.id);
      const { gmbh } = await acmePair(user.id);
      const { conversationId, form } = await firstTurnWithForm();
      expect(form.kind).toBe('FORM');
      const pick = optionIdOf(form, 'CUSTOMER', (o) => o.label === 'Acme GmbH');
      const usedBefore = await used(user.id);
      script(textOnly());

      const { response, parts } = await sendForm(conversationId, form.id, [pick], 'something else entirely');

      expect(response.status).toBe(200);
      expect(streamCalls()).toBeGreaterThanOrEqual(1);
      expect((await onlyCard()).customer.customerId).toBe(gmbh.id);
      expect(parts.some((p) => p.type === 'data-draft-card')).toBe(true);
      const after = await formRow(form.id);
      expect(after.state).toBe('CHOSEN');
      expect(after.answers).toEqual([pick]);
      const message = await lastUserMessage();
      expect((message.parts as any[])[0].text).toBe('Customer: Acme GmbH');
      expect(message.origin).toBe('FORM');
      expect(await prisma.conversationMessage.count({ where: { origin: 'PRESSED' } })).toBe(0);
      expect(await used(user.id)).toBe(usedBefore + 1);
    });
  });

  describe('AC-08b: Customer and account in one Send', () => {
    // Review 2026-10-13 R1-B1: the real model passes the currency as written ("$50" -> "$"); the Send still fits.
    it.each(['USD', '$'])('AC-08b (currency passed as "%s"): a form asking Customer and bank account, answered in one Send, is one slot and one card with both picks', async (currency) => {
      const user = await freelancer('t57-ac08b@example.com');
      const { alpha, beta } = await profileWithAccounts(user.id);
      const { corp, gmbh } = await acmePair(user.id);
      await primeAllowance(user.id, 3);
      const { conversationId, form } = await seedForm(user.id, {
        questions: [
          customerQuestion([{ id: corp.id, label: 'Acme Corp' }, { id: gmbh.id, label: 'Acme GmbH' }], 0),
          accountQuestion([{ id: alpha.id, label: 'Alpha Bank ••1111 · USD' }, { id: beta.id, label: 'Beta Bank ••2222 · USD' }], 1),
        ],
        request: { customer: 'Acme', currency, lines: LINES },
      });
      script(textOnly());

      const { response } = await sendForm(conversationId, form.id, [{ questionId: 0, optionId: 1 }, { questionId: 1, optionId: 0 }]);

      expect(response.status).toBe(200);
      expect(streamCalls()).toBeGreaterThanOrEqual(1);
      const proposal = await onlyCard();
      expect(proposal.customer.customerId).toBe(gmbh.id);
      expect(proposal.bankAccount.bankAccountId).toBe(alpha.id);
      expect(await used(user.id)).toBe(4);
      expect((await lastUserMessage() as any).parts[0].text).toBe('Customer: Acme GmbH\nBank account: Alpha Bank ••1111 · USD');
    });
  });

  describe('AC-10: look-alike Customers', () => {
    it('AC-10: picking the Cyrillic "Аcme Corp" continues with exactly that Customer', async () => {
      const user = await freelancer('t57-ac10@example.com');
      await profileWithOneUsdAccount(user.id);
      await createCustomer(prisma, user.id, { name: 'Acme Corp', email: 'ap@acme-us.example.test' });
      const cyrillic = await createCustomer(prisma, user.id, { name: 'Аcme Corp', email: 'ap@acme-ua.example.test' });
      const { conversationId, form } = await firstTurnWithForm('Acme Corp');
      const pick = optionIdOf(form, 'CUSTOMER', (o) => o.ref.customerId === cyrillic.id);
      script(textOnly());

      const { response } = await sendForm(conversationId, form.id, [pick]);

      expect(response.status).toBe(200);
      expect(streamCalls()).toBeGreaterThanOrEqual(1);
      expect((await onlyCard()).customer.customerId).toBe(cyrillic.id);
    });
  });

  describe('AC-11: the last message of the day', () => {
    it("AC-11: with 29 used the first Send counts (30); the next reply's form Send is 429, its form stays OPEN with no answers, and the model is not called for it", async () => {
      const user = await freelancer('t57-ac11@example.com');
      const { alpha } = await profileWithAccounts(user.id);
      const { corp, gmbh } = await acmePair(user.id);
      await primeAllowance(user.id, 29);
      const { conversationId, form } = await seedForm(user.id, {
        questions: [customerQuestion([{ id: corp.id, label: 'Acme Corp' }, { id: gmbh.id, label: 'Acme GmbH' }])],
      });

      script(textOnly('Which account?'));
      const first = await sendForm(conversationId, form.id, [{ questionId: 0, optionId: 1 }]);
      expect(first.response.status).toBe(200);
      expect(streamCalls()).toBeGreaterThanOrEqual(1);
      expect(await used(user.id)).toBe(30);
      expect((await formRow(form.id)).state).toBe('CHOSEN');
      // Two USD accounts are still undecided, so the reply holds the next form (T55).
      const nextForm = await latestOpenForm();
      expect(nextForm.id).not.toBe(form.id);
      expect(nextForm.kind).toBe('FORM');
      const account = optionIdOf(nextForm, 'BANK_ACCOUNT', (o) => o.ref.bankAccountId === alpha.id);
      const messagesBefore = await prisma.conversationMessage.count();

      script(textOnly());
      const second = await sendForm(conversationId, nextForm.id, [account]);

      expect(second.response.status).toBe(429);
      expect(JSON.parse(second.raw)).toMatchObject({ success: false, code: 'RATE_LIMITED', details: { kind: 'ALLOWANCE_USED_UP' } });
      noModelCalls();
      const after = await formRow(nextForm.id);
      expect(after.state).toBe('OPEN');
      expect(after.answers).toBeNull();
      expect(await used(user.id)).toBe(30);
      expect(await prisma.conversationMessage.count()).toBe(messagesBefore);
    });
  });

  describe('AC-12b: a Send that cannot be applied', () => {
    async function refusalSetup(email: string) {
      const user = await freelancer(email);
      await profileWithAccounts(user.id);
      const { corp, gmbh } = await acmePair(user.id);
      const other = await createFreelancer(prisma, { email: `other-${email}`, timeZone: TZ });
      const foreignCustomer = await createCustomer(prisma, other.id, { name: 'Acme Foreign', email: 'x@foreign.example.test' });
      return { user, other, corp, gmbh, foreignCustomer };
    }
    const twoOptions = (corp: { id: string }, gmbh: { id: string }) =>
      customerQuestion([{ id: corp.id, label: 'Acme Corp' }, { id: gmbh.id, label: 'Acme GmbH' }]);
    const notes = q({ questionId: 1, field: 'NOTES', heading: 'Notes', input: 'TEXT', required: false, skippable: true, source: 'CHAT' });

    it('AC-12b: an older (closed) form, another Freelancer\'s form and a never-existing form give byte-identical 409 bodies, no model call, no slot, no change', async () => {
      const { user, other, corp, gmbh } = await refusalSetup('t57-ac12b@example.com');
      const { conversationId, form } = await seedForm(user.id, { questions: [twoOptions(corp, gmbh)], state: 'CLOSED' });
      const foreignConversation = await createConversation(prisma, {
        userId: other.id,
        messages: [{ role: 'USER', text: 'hi' }, { role: 'ASSISTANT', text: 'Which one?' }],
      });
      const foreignForm = await createQuestionForm(prisma, {
        userId: other.id,
        conversationId: foreignConversation.id,
        messageId: foreignConversation.messages[1].id,
      });
      const usedBefore = await used(user.id);
      const messagesBefore = await prisma.conversationMessage.count();
      const formsBefore = await prisma.choiceOffer.findMany({ orderBy: { id: 'asc' } });
      script(textOnly());

      const closed = await sendForm(conversationId, form.id, [{ questionId: 0, optionId: 0 }]);
      const foreign = await sendForm(conversationId, foreignForm.id, [{ questionId: 0, optionId: 1 }]);
      const missing = await sendForm(conversationId, 'clx0neverexisted0000000001', [{ questionId: 0, optionId: 0 }]);

      for (const r of [closed, foreign, missing]) expect(r.response.status).toBe(409);
      expect(JSON.parse(closed.raw)).toEqual(UNAVAILABLE_BODY);
      expect(foreign.raw).toBe(closed.raw);
      expect(missing.raw).toBe(closed.raw);
      noModelCalls();
      expect(await used(user.id)).toBe(usedBefore);
      expect(await prisma.conversationMessage.count()).toBe(messagesBefore);
      expect(await prisma.choiceOffer.findMany({ orderBy: { id: 'asc' } })).toEqual(formsBefore);
    });

    it('AC-12b: a form of an older reply (CLOSED by a newer one) is the identical 409 while the newer form stays OPEN', async () => {
      const { user, corp, gmbh } = await refusalSetup('t57-ac12b-older@example.com');
      const older = await seedForm(user.id, { questions: [twoOptions(corp, gmbh)], state: 'CLOSED' });
      const latest = await seedForm(user.id, { questions: [twoOptions(corp, gmbh)], conversationId: older.conversationId });
      script(textOnly());

      const { response, raw } = await sendForm(older.conversationId, older.form.id, [{ questionId: 0, optionId: 0 }]);

      expect(response.status).toBe(409);
      expect(JSON.parse(raw)).toEqual(UNAVAILABLE_BODY);
      noModelCalls();
      expect((await formRow(latest.form.id)).state).toBe('OPEN');
    });

    it.each([
      ['a question the form does not hold', [{ questionId: 5, optionId: 0 }]],
      ['an option the question does not hold', [{ questionId: 0, optionId: 7 }]],
      ['a required question left out', [{ questionId: 1, skipped: true }]],
      ['a skip of a question that cannot be skipped', [{ questionId: 0, skipped: true }]],
      ['typed text for a question that offers no input', [{ questionId: 2, text: 'hello' }]],
    ] as Array<[string, Answer[]]>)('AC-12b: %s is the identical 409, uncounted, no model call, row unchanged', async (_label, answers) => {
      const { user, corp, gmbh } = await refusalSetup(`t57-12b-${_label.length}@example.com`);
      const noInput = q({ questionId: 2, field: 'CURRENCY', heading: 'Currency', input: 'NONE', required: false, skippable: true, options: [{ optionId: 0, label: 'USD', ref: { currency: 'USD' } }] });
      const { conversationId, form } = await seedForm(user.id, { questions: [twoOptions(corp, gmbh), notes, noInput] });
      const before = { used: await used(user.id), messages: await prisma.conversationMessage.count(), form: await formRow(form.id) };
      script(textOnly());

      const { response, raw } = await sendForm(conversationId, form.id, answers);

      expect(response.status).toBe(409);
      expect(JSON.parse(raw)).toEqual(UNAVAILABLE_BODY);
      noModelCalls();
      expect(await used(user.id)).toBe(before.used);
      expect(await prisma.conversationMessage.count()).toBe(before.messages);
      expect(await formRow(form.id)).toEqual(before.form);
      expect(await prisma.draftCard.count()).toBe(0);
    });

    it('the same question answered twice is refused by the body schema as 400 VALIDATION (before any form check); uncounted, no model call', async () => {
      const { user, corp, gmbh } = await refusalSetup('t57-12b-dup@example.com');
      const { conversationId, form } = await seedForm(user.id, { questions: [twoOptions(corp, gmbh)] });
      script(textOnly());

      const { response, raw } = await sendForm(conversationId, form.id, [{ questionId: 0, optionId: 0 }, { questionId: 0, optionId: 1 }]);

      expect(response.status).toBe(400);
      expect(JSON.parse(raw).code).toBe('VALIDATION');
      noModelCalls();
      expect(await used(user.id)).toBe(0);
      expect((await formRow(form.id)).state).toBe('OPEN');
    });

    it("AC-12b: an option that points at another Freelancer's Customer is the identical 409; the draft never moves toward that record", async () => {
      const { user, corp, foreignCustomer } = await refusalSetup('t57-12b-foreign-record@example.com');
      const { conversationId, form } = await seedForm(user.id, {
        questions: [customerQuestion([{ id: corp.id, label: 'Acme Corp' }, { id: foreignCustomer.id, label: 'Acme Foreign' }])],
      });
      const usedBefore = await used(user.id);
      script(textOnly());

      const { response, raw } = await sendForm(conversationId, form.id, [{ questionId: 0, optionId: 1 }]);

      expect(response.status).toBe(409);
      expect(JSON.parse(raw)).toEqual(UNAVAILABLE_BODY);
      noModelCalls();
      expect(await used(user.id)).toBe(usedBefore);
      expect((await formRow(form.id)).state).toBe('OPEN');
      expect(await prisma.draftCard.count()).toBe(0);
    });

    it('a form sent in another Conversation of the same Freelancer is the identical 409', async () => {
      const { user, corp, gmbh } = await refusalSetup('t57-12b-otherconv@example.com');
      const { form } = await seedForm(user.id, { questions: [twoOptions(corp, gmbh)] });
      const elsewhere = await createConversation(prisma, { userId: user.id, messages: [{ role: 'USER' }, { role: 'ASSISTANT', text: 'ok' }] });
      script(textOnly());

      const { response, raw } = await sendForm(elsewhere.id, form.id, [{ questionId: 0, optionId: 0 }]);

      expect(response.status).toBe(409);
      expect(JSON.parse(raw)).toEqual(UNAVAILABLE_BODY);
      noModelCalls();
    });

    it('an invalid Send is 409 even when the allowance is used up (checked before the allowance)', async () => {
      const { user, corp, gmbh } = await refusalSetup('t57-409-first@example.com');
      const { conversationId } = await seedForm(user.id, { questions: [twoOptions(corp, gmbh)] });
      await primeAllowance(user.id, 30);
      script(textOnly());

      const { response, raw } = await sendForm(conversationId, 'clx0neverexisted0000000001', [{ questionId: 0, optionId: 0 }]);

      expect(response.status).toBe(409);
      expect(JSON.parse(raw)).toEqual(UNAVAILABLE_BODY);
      noModelCalls();
      expect(await used(user.id)).toBe(30);
    });
  });

  describe('AC-13: the latest unsent form whose picked record is gone', () => {
    it('AC-13: the picked bank account was deleted since the form was shown: the identical 409, uncounted, no model call, form unchanged', async () => {
      const user = await freelancer('t57-ac13@example.com');
      const { alpha, beta } = await profileWithAccounts(user.id);
      const { corp, gmbh } = await acmePair(user.id);
      const { conversationId, form } = await seedForm(user.id, {
        questions: [
          customerQuestion([{ id: corp.id, label: 'Acme Corp' }, { id: gmbh.id, label: 'Acme GmbH' }], 0),
          accountQuestion([{ id: alpha.id, label: 'Alpha Bank ••1111 · USD' }, { id: beta.id, label: 'Beta Bank ••2222 · USD' }], 1),
        ],
      });
      await prisma.bankAccount.delete({ where: { id: alpha.id } });
      const usedBefore = await used(user.id);
      const messagesBefore = await prisma.conversationMessage.count();
      script(textOnly());

      const { response, raw } = await sendForm(conversationId, form.id, [{ questionId: 0, optionId: 1 }, { questionId: 1, optionId: 0 }]);

      expect(response.status).toBe(409);
      expect(JSON.parse(raw)).toEqual(UNAVAILABLE_BODY);
      noModelCalls();
      expect(await used(user.id)).toBe(usedBefore);
      expect(await prisma.conversationMessage.count()).toBe(messagesBefore);
      const after = await formRow(form.id);
      expect(after.state).toBe('OPEN');
      expect(after.answers).toBeNull();
    });
  });

  describe('AC-14: a Customer question that offers no options (input only)', () => {
    it('AC-14: the typed "Studio North" is matched by name by the resolver, not by a picked option', async () => {
      const user = await freelancer('t57-ac14@example.com');
      await profileWithOneUsdAccount(user.id);
      for (let i = 1; i <= 9; i += 1) await createCustomer(prisma, user.id, { name: `Studio ${i}`, email: `s${i}@studio.example.test` });
      const north = await createCustomer(prisma, user.id, { name: 'Studio North', email: 'north@studio.example.test' });
      const { conversationId, form } = await seedForm(user.id, {
        questions: [q({ questionId: 0, field: 'CUSTOMER', heading: 'Customer', matchCount: 10 })],
        request: { customer: 'Studio', currency: 'USD', lines: LINES },
      });
      script(textOnly());

      const { response } = await sendForm(conversationId, form.id, [{ questionId: 0, text: 'Studio North' }]);

      expect(response.status).toBe(200);
      expect((await onlyCard()).customer.customerId).toBe(north.id);
      expect(((await lastUserMessage()).parts as any[])[0].text).toBe('Customer: Studio North');
    });
  });

  describe('AC-38: typed "Other…" answers', () => {
    const OTHER = 'Оohn  Doe'; // Cyrillic "О", two spaces

    async function setup(email: string) {
      const user = await freelancer(email);
      await profileWithOneUsdAccount(user.id);
      const { corp, gmbh } = await acmePair(user.id);
      const john = await createCustomer(prisma, user.id, { name: OTHER, email: 'john@doe.example.test' });
      const { conversationId, form } = await seedForm(user.id, {
        questions: [customerQuestion([{ id: corp.id, label: 'Acme Corp' }, { id: gmbh.id, label: 'Acme GmbH' }], 0), priceQuestion(1)],
      });
      return { user, john, conversationId, form };
    }

    it('AC-38: "Other…" Customer "Оohn  Doe" and price "40" give the card for that Customer at 40.00', async () => {
      const { user, john, conversationId, form } = await setup('t57-ac38@example.com');
      script(textOnly());

      const { response } = await sendForm(conversationId, form.id, [{ questionId: 0, text: OTHER }, { questionId: 1, text: '40' }]);

      expect(response.status).toBe(200);
      const proposal = await onlyCard();
      expect(proposal.customer.customerId).toBe(john.id);
      expect(proposal.lines[0].rate).toBe('40.00');
      expect(await used(user.id)).toBe(1);
      expect(((await lastUserMessage()).parts as any[])[0].text).toBe(`Customer: ${OTHER.trim()}\nLine 1 · Price: 40`);
    });

    it.each(['forty', '-5', '0', '1.234'])('AC-38: a price of "%s" is 400 VALIDATION keyed form.answers.1; nothing sent, counted, claimed or saved; the model is not called', async (price) => {
      const { user, conversationId, form } = await setup(`t57-ac38-${price}@example.com`);
      script(textOnly());

      const { response, raw } = await sendForm(conversationId, form.id, [{ questionId: 0, text: OTHER }, { questionId: 1, text: price }]);

      expect(response.status).toBe(400);
      expect(JSON.parse(raw)).toEqual({
        success: false,
        code: 'VALIDATION',
        error: 'Please fix the highlighted fields.',
        fieldErrors: { 'form.answers.1': [AMOUNT_MESSAGE] },
      });
      noModelCalls();
      expect(await used(user.id)).toBe(0);
      const after = await formRow(form.id);
      expect(after.state).toBe('OPEN');
      expect(after.answers).toBeNull();
      expect(await prisma.draftCard.count()).toBe(0);
      expect(await prisma.conversationMessage.count()).toBe(2); // the seeded USER and ASSISTANT messages only
    });
  });

  describe('AC-39: dates', () => {
    it('AC-39: the "Yesterday" option made earlier (2026-10-12) sent later is issueDate 2026-10-12; "14 days after" is due 2026-10-26', async () => {
      const user = await freelancer('t57-ac39@example.com');
      await profileWithOneUsdAccount(user.id);
      const { gmbh } = await acmePair(user.id);
      const { conversationId, form } = await seedForm(user.id, {
        questions: [
          q({ questionId: 0, field: 'ISSUE_DATE', heading: 'Issue date', input: 'DATE', source: 'CHAT', options: [{ optionId: 0, label: 'Yesterday', ref: { date: '2026-10-12' } }] }),
          q({ questionId: 1, field: 'DUE_DATE', heading: 'Due date', input: 'DATE', source: 'CHAT', options: [{ optionId: 0, label: '14 days after the issue date', ref: { daysAfterIssue: 14 } }] }),
        ],
        request: { customerId: gmbh.id, currency: 'USD', lines: LINES },
      });
      script(textOnly());

      const { response } = await sendForm(conversationId, form.id, [{ questionId: 0, optionId: 0 }, { questionId: 1, optionId: 0 }]);

      expect(response.status).toBe(200);
      const proposal = await onlyCard();
      expect(proposal.issueDate.value).toBe('2026-10-12');
      expect(proposal.dueDate.value).toBe('2026-10-26');
    });
  });

  describe('a form with no draft action to run', () => {
    it('a free-question form (request NULL): no draft action and no card; the answers reach the model as data (a prior ask_user step), the message reads "heading: answer", origin FORM, one slot', async () => {
      const user = await freelancer('t57-free@example.com');
      const { conversationId, form } = await seedForm(user.id, {
        questions: [q({ questionId: 0, field: 'FREE', heading: 'Rush fee', prompt: 'Is there a rush fee?', source: 'CHAT' })],
        request: null,
      });
      script(textOnly('Noted, no draft needed.'));

      const { response } = await sendForm(conversationId, form.id, [{ questionId: 0, text: 'yes please' }], 'client text that must be ignored');

      expect(response.status).toBe(200);
      expect(streamCalls()).toBeGreaterThanOrEqual(1);
      expect(await prisma.draftCard.count()).toBe(0);
      const flat = JSON.stringify(prompts[0]);
      expect(flat).toContain('yes please');
      expect(flat).not.toContain('client text that must be ignored');
      const calls = (prompts[0] as any[]).flatMap((m) => (Array.isArray(m.content) ? m.content : []));
      expect(calls.some((p) => p.type === 'tool-call' && p.toolName === 'ask_user')).toBe(true);
      expect(calls.some((p) => p.type === 'tool-call' && p.toolName === 'propose_draft')).toBe(false);
      const message = await lastUserMessage();
      expect((message.parts as any[])[0].text).toBe('Rush fee: yes please');
      expect(message.origin).toBe('FORM');
      const after = await formRow(form.id);
      expect(after.state).toBe('CHOSEN');
      expect(await used(user.id)).toBe(1);
    });

    it('a mixed form: the draft answer is pinned (card for the picked Customer) and the free answer is in the composed message the model reads', async () => {
      const user = await freelancer('t57-mixed@example.com');
      await profileWithOneUsdAccount(user.id);
      const { corp, gmbh } = await acmePair(user.id);
      const { conversationId, form } = await seedForm(user.id, {
        questions: [
          customerQuestion([{ id: corp.id, label: 'Acme Corp' }, { id: gmbh.id, label: 'Acme GmbH' }], 0),
          q({ questionId: 1, field: 'FREE', heading: 'Rush fee', source: 'CHAT' }),
        ],
      });
      script(textOnly());

      const { response } = await sendForm(conversationId, form.id, [{ questionId: 0, optionId: 1 }, { questionId: 1, text: 'yes please' }]);

      expect(response.status).toBe(200);
      expect((await onlyCard()).customer.customerId).toBe(gmbh.id);
      expect(((await lastUserMessage()).parts as any[])[0].text).toBe('Customer: Acme GmbH\nRush fee: yes please');
      expect(JSON.stringify(prompts[0])).toContain('Rush fee: yes please');
    });

    it('a draft form whose pinned request still fails draftRequestSchema (no line to price) runs no draft action and sends the answers as data', async () => {
      const user = await freelancer('t57-partial@example.com');
      const { gmbh } = await acmePair(user.id);
      const { conversationId, form } = await seedForm(user.id, {
        questions: [customerQuestion([{ id: gmbh.id, label: 'Acme GmbH' }], 0)],
        request: { currency: 'USD' }, // ask_user's partial draft: no lines yet
      });
      script(textOnly('What are the lines?'));

      const { response } = await sendForm(conversationId, form.id, [{ questionId: 0, optionId: 0 }]);

      expect(response.status).toBe(200);
      expect(await prisma.draftCard.count()).toBe(0);
      const calls = (prompts[0] as any[]).flatMap((m) => (Array.isArray(m.content) ? m.content : []));
      expect(calls.some((p) => p.type === 'tool-call' && p.toolName === 'ask_user')).toBe(true);
      expect(calls.some((p) => p.type === 'tool-call' && p.toolName === 'propose_draft')).toBe(false);
      expect((await lastUserMessage()).origin).toBe('FORM');
    });
  });

  // T71 (review R20-3, AC-10, F6): a picked record reaches the model as its id, as data, never as a label to match again.
  describe('T71: picked record ids in the prior ask_user step', () => {
    const askResult = (prompt: unknown) => {
      const parts = (prompt as any[]).flatMap((m) => (Array.isArray(m.content) ? m.content : []));
      const part = parts.find((p) => p.type === 'tool-result' && p.toolName === 'ask_user');
      return { part, json: JSON.stringify(part ?? null) };
    };
    const hasId = (json: string, key: string, id: string) => new RegExp(`"${key}"\\s*:\\s*"${id}"`).test(json);

    it('a form without draft: the prior ask_user result carries exactly the picked Customer id as customerId, beside the heading and answer, and still says data not instructions', async () => {
      const user = await freelancer('t71-ids@example.com');
      const { corp, gmbh } = await acmePair(user.id);
      const { conversationId, form } = await seedForm(user.id, {
        questions: [customerQuestion([{ id: corp.id, label: 'Acme Corp' }, { id: gmbh.id, label: 'Acme GmbH' }], 0)],
        request: null,
      });
      script(textOnly('Which lines?'));

      const { response } = await sendForm(conversationId, form.id, [{ questionId: 0, optionId: 1 }]);

      expect(response.status).toBe(200);
      const { json } = askResult(prompts[0]);
      expect(json).toContain('Customer');
      expect(json).toContain('Acme GmbH');
      expect(hasId(json, 'customerId', gmbh.id)).toBe(true);
      expect(json).not.toContain(corp.id);
      expect(json).toMatch(/not instructions/);
    });

    it('when the model passes that customerId to propose_draft the card names exactly that Customer, not the look-alike', async () => {
      const user = await freelancer('t71-card@example.com');
      await profileWithOneUsdAccount(user.id);
      const { corp, gmbh } = await acmePair(user.id);
      const { conversationId, form } = await seedForm(user.id, {
        questions: [customerQuestion([{ id: corp.id, label: 'Acme Corp' }, { id: gmbh.id, label: 'Acme GmbH' }], 0)],
        request: null,
      });
      // The scripted model reads the id out of its own input; with no id there it can only pass the name.
      script((i) => {
        if (i > 0) return { text: 'Here is the draft.' };
        const id = /"customerId"\s*:\s*"([^"]+)"/.exec(askResult(prompts[prompts.length - 1]).json)?.[1];
        return {
          toolCall: { name: 'propose_draft', input: id ? { customerId: id, currency: 'USD', lines: LINES } : { customer: 'Acme', currency: 'USD', lines: LINES } },
        };
      });

      const { response } = await sendForm(conversationId, form.id, [{ questionId: 0, optionId: 1 }]);

      expect(response.status).toBe(200);
      expect((await onlyCard()).customer.customerId).toBe(gmbh.id);
    });

    it('a picked sender profile, bank account and product each reach the model as that record id', async () => {
      const user = await freelancer('t71-more@example.com');
      const { profile, alpha, beta } = await profileWithAccounts(user.id);
      const other = await createSenderProfile(prisma, user.id, { name: 'Main Two' });
      const coaching = await createProduct(prisma, user.id, { name: 'Coaching' });
      const coachingPlus = await createProduct(prisma, user.id, { name: 'Coaching+' });
      const { conversationId, form } = await seedForm(user.id, {
        questions: [
          q({ questionId: 0, field: 'SENDER_PROFILE', heading: 'Sender profile', options: [profile, other].map((x, i) => ({ optionId: i, label: x.name, ref: { senderProfileId: x.id } })) }),
          accountQuestion([{ id: alpha.id, label: 'Alpha Bank' }, { id: beta.id, label: 'Beta Bank' }], 1),
          q({ questionId: 2, field: 'PRODUCT', lineIndex: 0, heading: 'Line 1 · Product', options: [coaching, coachingPlus].map((x, i) => ({ optionId: i, label: x.name, ref: { productId: x.id } })) }),
        ],
        request: null,
      });
      script(textOnly('Noted.'));

      const { response } = await sendForm(conversationId, form.id, [
        { questionId: 0, optionId: 1 },
        { questionId: 1, optionId: 1 },
        { questionId: 2, optionId: 1 },
      ]);

      expect(response.status).toBe(200);
      const { json } = askResult(prompts[0]);
      expect(hasId(json, 'senderProfileId', other.id)).toBe(true);
      expect(json).toContain(beta.id);
      expect(json).not.toContain(alpha.id);
      expect(json).not.toContain(profile.id);
      expect(hasId(json, 'productId', coachingPlus.id)).toBe(true);
      expect(json).not.toContain(coaching.id);
    });

    it('a request that still fails draftRequestSchema after the answers: the partial pinned request (picked id pinned) is passed as data in the same prior step', async () => {
      const user = await freelancer('t71-partial@example.com');
      const { corp, gmbh } = await acmePair(user.id);
      const { conversationId, form } = await seedForm(user.id, {
        questions: [customerQuestion([{ id: corp.id, label: 'Acme Corp' }, { id: gmbh.id, label: 'Acme GmbH' }], 0)],
        request: { currency: 'USD', poNumber: 'PO-71' },
      });
      script(textOnly('What are the lines?'));

      const { response } = await sendForm(conversationId, form.id, [{ questionId: 0, optionId: 1 }]);

      expect(response.status).toBe(200);
      const { json } = askResult(prompts[0]);
      expect(hasId(json, 'customerId', gmbh.id)).toBe(true);
      expect(json).toContain('PO-71');
      expect(json).toMatch(/not instructions/);
      expect(json).not.toContain(corp.id);
    });
  });

  // T76 (review R21-1, AC-08, F2): a pinned form Send that still resolves to ISSUES hands the model askFields, in the
  // pinned propose_draft result and in the answer to a propose_draft re-call, so it writes one prompt per open field.
  describe('T76: askFields on the pinned form-Send path', () => {
    const proposeResults = (prompt: unknown) =>
      (prompt as any[])
        .flatMap((m) => (Array.isArray(m.content) ? m.content : []))
        .filter((p) => p.type === 'tool-result' && p.toolName === 'propose_draft')
        .map((p) => p.output?.value as any);

    async function sendCustomerPick(email: string, step: (i: number) => StubStep) {
      const user = await freelancer(email);
      await profileWithAccounts(user.id); // two USD accounts: still undecided after the Customer is picked
      const { corp, gmbh } = await acmePair(user.id);
      const { conversationId, form } = await seedForm(user.id, {
        questions: [customerQuestion([{ id: corp.id, label: 'Acme Corp' }, { id: gmbh.id, label: 'Acme GmbH' }], 0)],
      });
      script(step);
      return sendForm(conversationId, form.id, [{ questionId: 0, optionId: 1 }]);
    }

    it('the pinned propose_draft result the model reads carries askFields with the open bank account', async () => {
      const { response } = await sendCustomerPick('t76-pinned@example.com', textOnly('Which account?'));

      expect(response.status).toBe(200);
      const [pinned] = proposeResults(prompts[0]);
      expect(pinned?.kind).toBe('ISSUES');
      expect(pinned.askFields).toEqual([{ field: 'BANK_ACCOUNT', lineIndex: null }]);
    });

    it('a propose_draft re-call in that turn is answered with the same askFields', async () => {
      const { response } = await sendCustomerPick('t76-recall@example.com', (i) =>
        i === 0 ? { toolCall: { name: 'propose_draft', input: REQUEST } } : { text: 'Which account?' }
      );

      expect(response.status).toBe(200);
      expect(streamCalls()).toBeGreaterThanOrEqual(2);
      const results = proposeResults(prompts[prompts.length - 1]);
      expect(results.length).toBeGreaterThanOrEqual(2); // the pinned step and the re-call
      for (const r of results) expect(r.askFields).toEqual([{ field: 'BANK_ACCOUNT', lineIndex: null }]);
    });
  });

  describe('request validation', () => {
    it('a form without a conversationId is 400 with the exact sentence; nothing counted, no model call', async () => {
      const user = await freelancer('t57-400@example.com');
      script(textOnly());

      const response = await post(formBody(null, 'clx0offer000000000000001', [{ questionId: 0, optionId: 1 }]));
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.code).toBe('VALIDATION');
      expect(body.fieldErrors.form).toEqual(['A form can only be sent in a saved conversation.']);
      noModelCalls();
      expect(await used(user.id)).toBe(0);
      expect(await prisma.conversation.count()).toBe(0);
    });

    it('a request with a `choice` is refused 400 VALIDATION (unknown key); nothing counted, no model call', async () => {
      const user = await freelancer('t57-choice-gone@example.com');
      script(textOnly());

      const response = await post(typed('Acme GmbH', { choice: { offerId: 'clx0offer000000000000001', optionId: 1 } }, 'clx0conv0000000000000001'));
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.code).toBe('VALIDATION');
      noModelCalls();
      expect(await used(user.id)).toBe(0);
      expect(await prisma.conversationMessage.count()).toBe(0);
    });
  });

  describe('release on failure', () => {
    it('a provider failure after the claim leaves the form OPEN with no answers, the slot given back and nothing saved', async () => {
      const user = await freelancer('t57-release@example.com');
      await profileWithAccounts(user.id);
      const { corp, gmbh } = await acmePair(user.id);
      const { conversationId, form } = await seedForm(user.id, {
        questions: [customerQuestion([{ id: corp.id, label: 'Acme Corp' }, { id: gmbh.id, label: 'Acme GmbH' }])],
      });
      const usedBefore = await used(user.id);
      const messagesBefore = await prisma.conversationMessage.count();
      script(() => ({
        error: new APICallError({ message: 'upstream 503', url: 'https://x', requestBodyValues: {}, statusCode: 503, isRetryable: false }),
      }));

      const { raw } = await sendForm(conversationId, form.id, [{ questionId: 0, optionId: 1 }]);

      expect(raw).toMatch(/"counted":false/);
      expect(streamCalls()).toBeGreaterThanOrEqual(1);
      // The turn really ran as the form's Send (the composed message reached the model), then everything was given back.
      expect(JSON.stringify(prompts[0])).toContain('Customer: Acme GmbH');
      const after = await formRow(form.id);
      expect(after.state).toBe('OPEN');
      expect(after.answers).toBeNull();
      expect(await used(user.id)).toBe(usedBefore);
      expect(await prisma.conversationMessage.count()).toBe(messagesBefore);
      expect(await prisma.draftCard.count()).toBe(0);
    });
  });

  // Review 2026-10-13 R1-S3: a system failure while checking a Send is "couldn't be completed" (503), never "no longer
  // available" (409): the Freelancer must not be told a valid form is gone.
  describe('a failure while checking the form', () => {
    it('is 503 FAILED, not 409; nothing claimed, no slot, no model call', async () => {
      const user = await freelancer('t57-check-fails@example.com');
      await profileWithAccounts(user.id);
      const { corp, gmbh } = await acmePair(user.id);
      const { conversationId, form } = await seedForm(user.id, {
        questions: [customerQuestion([{ id: corp.id, label: 'Acme Corp' }, { id: gmbh.id, label: 'Acme GmbH' }])],
      });
      const usedBefore = await used(user.id);
      script(textOnly());
      vi.spyOn(appPrisma.choiceOffer, 'findFirst').mockRejectedValueOnce(new Error('connection lost'));
      vi.spyOn(console, 'error').mockImplementation(() => undefined);

      const { response, raw } = await sendForm(conversationId, form.id, [{ questionId: 0, optionId: 1 }]);

      expect(response.status).toBe(503);
      expect(raw).not.toContain('CHOICE_UNAVAILABLE');
      noModelCalls();
      expect((await formRow(form.id)).state).toBe('OPEN');
      expect(await used(user.id)).toBe(usedBefore);
    });
  });

  describe('typed and dashboard messages are unchanged', () => {
    it('a typed message after a form was shown still closes the open form and is saved TYPED', async () => {
      const user = await freelancer('t57-typed-closes@example.com');
      await profileWithOneUsdAccount(user.id);
      await acmePair(user.id);
      const { conversationId, form } = await firstTurnWithForm();
      script(textOnly('Sure.'));

      await sendTyped('never mind, show my customers', {}, conversationId);

      expect((await formRow(form.id)).state).toBe('CLOSED');
      expect((await lastUserMessage()).origin).toBe('TYPED');
    });
  });

  describe('AC-29: the dashboard prompt and start points', () => {
    it('AC-29: origin DASHBOARD + startedFrom DASHBOARD_PROMPT on a new Conversation is saved as such; one slot', async () => {
      const user = await freelancer('t57-ac29@example.com');
      script(textOnly('You have no overdue invoices.'));

      const parts = await sendTyped('who owes me money?', { origin: 'DASHBOARD', startedFrom: 'DASHBOARD_PROMPT' });

      expect(parts.some((p) => p.type === 'data-conversation')).toBe(true);
      expect(streamCalls()).toBe(1);
      expect((await prisma.conversation.findFirstOrThrow()).startedFrom).toBe('DASHBOARD_PROMPT');
      expect((await lastUserMessage()).origin).toBe('DASHBOARD');
      expect(await used(user.id)).toBe(1);
    });

    it('AC-29: startedFrom INVOICE_LIST alone gives a TYPED message and that start point', async () => {
      const user = await freelancer('t57-ac29b@example.com');
      script(textOnly('Done.'));

      await sendTyped('which invoices are overdue?', { startedFrom: 'INVOICE_LIST' });

      expect(streamCalls()).toBe(1);
      expect((await prisma.conversation.findFirstOrThrow()).startedFrom).toBe('INVOICE_LIST');
      expect((await lastUserMessage()).origin).toBe('TYPED');
      expect(await used(user.id)).toBe(1);
    });
  });

  describe('AC-36: no session', () => {
    it('AC-36: a form Send without a session is refused 401; nothing counted, no model call', async () => {
      authMock.mockResolvedValue(null);
      script(textOnly());

      const response = await post(formBody('clx0conv0000000000000001', 'clx0offer000000000000001', [{ questionId: 0, optionId: 1 }]));

      expect(response.status).toBe(401);
      noModelCalls();
      expect(await prisma.messageAllowanceDay.count()).toBe(0);
      expect(await prisma.conversationMessage.count()).toBe(0);
    });
  });
});
