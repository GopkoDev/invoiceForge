// T58 (ai-chat-v2, AC-09, AC-11, AC-12b) extends this file: the stream contract with the injection and forged-id fixtures
// (every FormView label equals the label rule for its stored record), the remaining refusal causes, a 4-way concurrent
// Send, and the release rule (OPEN, or CLOSED when a newer message was saved meanwhile).
// T15 (ai-chat-v2, AC-11, AC-12b, AC-13; QG-1; sad.md §10) ported to forms in T57 (revision 2026-10-13, ADR-0011; file name
// kept, T58 adds the deeper form safety suite): the Send safety properties through POST /api/chat. Every cause of an
// unavailable form answers a byte-identical 409 with no model call, no slot, no saved message and no form change; two
// concurrent Sends of one form process exactly once; a provider failure after the claim releases both the claim and the
// slot. The model is the scripted stand-in; its call count is asserted.
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
import { createConversation } from './../support/factories/conversation';
import { createProduct } from './../support/factories/product';
import { createQuestionForm } from './../support/factories/choice-offer';
import { actingFreelancerForTest } from './../support/acting-freelancer';
import { partsOfText } from './../support/ai-stub-model';
import { INJECTED_MODEL_TEXT, INJECTED_NOTE, INJECTION_CANARIES } from './../support/fixtures/offer-injection';
import { scriptedModel, type StubStep } from './../support/ai-stub-model';

const authMock = vi.fn<() => Promise<{ user: { id: string } } | null>>();
vi.mock('@/auth', () => ({ auth: () => authMock() }));

let model: MockLanguageModelV4;
vi.mock('@/lib/ai/model', () => ({ getChatModel: () => model }));

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

const TZ = 'Europe/Kyiv';
const LINES = [{ description: 'Consulting', quantity: '20', price: '50' }];
const refusalBodies = new Set<string>();
const UNAVAILABLE_BODY = {
  success: false,
  code: 'CONFLICT',
  error: 'This form is no longer available. Answer the latest questions or type your request.',
  details: { kind: 'CHOICE_UNAVAILABLE' },
};

describe.runIf(containerRuntimeAvailable)('form safety: uniform refusals, one claim, release on failure (T15 ported, T57)', () => {
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

  function script(step: (i: number) => StubStep) {
    model = scriptedModel({ verdict: { topic: 'in_scope', language: 'en', intent: 'draft' }, steps: (i) => step(i) });
  }
  const textOnly = (text = 'Here is the draft.') => () => ({ text }) as StubStep;
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
  async function sendForm(conversationId: string, formId: string, answers: Array<Record<string, unknown>>) {
    const response = await post(typed('something else', { form: { formId, answers } }, conversationId));
    const raw = await response.text();
    return { response, raw };
  }

  const used = async (userId: string) => (await prisma.messageAllowanceDay.findFirst({ where: { userId } }))?.used ?? 0;
  const snapshot = async (userId: string) => ({
    used: await used(userId),
    allowance: await prisma.messageAllowanceDay.findMany({ orderBy: { userId: 'asc' } }),
    messages: await prisma.conversationMessage.count(),
    forms: await prisma.choiceOffer.findMany({ orderBy: { id: 'asc' } }),
    cards: await prisma.draftCard.count(),
  });

  /** One Freelancer: EUR default + two USD accounts, Customer Globex; one OPEN form asking for the USD account (question 0). */
  async function withOpenAccountForm(email: string, state: 'OPEN' | 'CHOSEN' | 'CLOSED' = 'OPEN') {
    const user = await createFreelancer(prisma, { email, timeZone: TZ });
    authMock.mockResolvedValue({ user: { id: user.id } });
    const profile = await createSenderProfile(prisma, user.id, { name: 'Main' });
    await createBankAccount(prisma, profile.id, { currency: 'EUR', bankName: 'Euro Bank', accountNumber: '5555555555' });
    const alpha = await createBankAccount(prisma, profile.id, { currency: 'USD', bankName: 'Alpha Bank', accountNumber: '1111111111' });
    const beta = await createBankAccount(prisma, profile.id, { currency: 'USD', bankName: 'Beta Bank', accountNumber: '2222222222' });
    const globex = await createCustomer(prisma, user.id, { name: 'Globex' });
    const conversation = await createConversation(prisma, {
      userId: user.id,
      messages: [{ role: 'USER', text: 'invoice Globex 20 hours at $50 in USD' }, { role: 'ASSISTANT', text: 'Which account?' }],
    });
    const form = await createQuestionForm(prisma, {
      userId: user.id,
      conversationId: conversation.id,
      messageId: conversation.messages[1].id,
      state,
      request: { customerId: globex.id, currency: 'USD', lines: LINES },
      questions: [
        {
          questionId: 0,
          field: 'BANK_ACCOUNT',
          lineIndex: null,
          heading: 'Bank account',
          prompt: null,
          options: [
            { optionId: 0, label: 'Alpha Bank ••1111 · USD', ref: { bankAccountId: alpha.id } },
            { optionId: 1, label: 'Beta Bank ••2222 · USD', ref: { bankAccountId: beta.id } },
          ],
          input: 'TEXT',
          required: true,
          skippable: false,
          matchCount: null,
          source: 'RESOLVER',
        },
      ],
    });
    const pickAlpha = [{ questionId: 0, optionId: 0 }];
    return { user, profile, alpha, beta, conversationId: conversation.id, form, pickAlpha };
  }

  /** Sends `formId`/`answers`, then asserts the uniform refusal and that nothing moved. */
  async function expectUniformRefusal(userId: string, conversationId: string, formId: string, answers: Array<Record<string, unknown>>) {
    const before = await snapshot(userId);
    script(textOnly());
    const reference = await sendForm(conversationId, 'clx0neverexisted0000000001', [{ questionId: 0, optionId: 0 }]);
    const result = await sendForm(conversationId, formId, answers);

    expect(result.response.status).toBe(409);
    expect(JSON.parse(result.raw)).toEqual(UNAVAILABLE_BODY);
    expect(result.raw).toBe(reference.raw);
    refusalBodies.add(result.raw);
    noModelCalls();
    expect(await snapshot(userId)).toEqual(before);
  }

  describe('AC-12b, AC-13: every cause of an unavailable form gives the same 409 and changes nothing', () => {
    it('a form from an older (CLOSED) reply', async () => {
      const { user, conversationId, form, pickAlpha } = await withOpenAccountForm('t15-closed@example.com', 'CLOSED');
      await expectUniformRefusal(user.id, conversationId, form.id, pickAlpha);
    });

    it("another Freelancer's form", async () => {
      const { user, conversationId, pickAlpha } = await withOpenAccountForm('t15-foreign@example.com');
      const other = await createFreelancer(prisma, { email: 't15-foreign-other@example.com', timeZone: TZ });
      const conversation = await createConversation(prisma, {
        userId: other.id,
        messages: [{ role: 'USER', text: 'hi' }, { role: 'ASSISTANT', text: 'Which one?' }],
      });
      const foreign = await createQuestionForm(prisma, { userId: other.id, conversationId: conversation.id, messageId: conversation.messages[1].id });
      await expectUniformRefusal(user.id, conversationId, foreign.id, pickAlpha);
    });

    it('a form that never existed', async () => {
      const { user, conversationId, pickAlpha } = await withOpenAccountForm('t15-never@example.com');
      await expectUniformRefusal(user.id, conversationId, 'clx0neverexisted0000000002', pickAlpha);
    });

    it('a form that is already CHOSEN', async () => {
      const { user, conversationId, form, pickAlpha } = await withOpenAccountForm('t15-chosen@example.com', 'CHOSEN');
      await expectUniformRefusal(user.id, conversationId, form.id, pickAlpha);
    });

    it('a question the form does not hold', async () => {
      const { user, conversationId, form } = await withOpenAccountForm('t15-badq@example.com');
      await expectUniformRefusal(user.id, conversationId, form.id, [{ questionId: 3, optionId: 0 }]);
    });

    it('an option the question does not hold', async () => {
      const { user, conversationId, form } = await withOpenAccountForm('t15-bado@example.com');
      await expectUniformRefusal(user.id, conversationId, form.id, [{ questionId: 0, optionId: 6 }]);
    });

    it('a hand-made request that omits a required answer (the form holds two required questions, one is answered)', async () => {
      const { user, conversationId, form, pickAlpha } = await withOpenAccountForm('t58-omitted@example.com');
      const price = {
        questionId: 1, field: 'PRICE', lineIndex: 0, heading: 'Line 1 · Price', prompt: null, options: [],
        input: 'AMOUNT', required: true, skippable: false, matchCount: null, source: 'CHAT',
      };
      await prisma.choiceOffer.update({ where: { id: form.id }, data: { questions: [...(form.questions as any[]), price] } });
      await expectUniformRefusal(user.id, conversationId, form.id, pickAlpha);
    });

    it('a skip on a required question', async () => {
      const { user, conversationId, form } = await withOpenAccountForm('t58-skip@example.com');
      await expectUniformRefusal(user.id, conversationId, form.id, [{ questionId: 0, skipped: true }]);
    });

    it.each([
      ['no answers at all', [] as Array<Record<string, unknown>>],
      ['the same question answered twice', [{ questionId: 0, optionId: 0 }, { questionId: 0, optionId: 1 }]],
    ])('%s: refused by the request check (400) before anything is counted, called or changed', async (_name, answers) => {
      const { user, conversationId, form } = await withOpenAccountForm(`t58-shape-${answers.length}@example.com`);
      const before = await snapshot(user.id);
      script(textOnly());

      const { response } = await sendForm(conversationId, form.id, answers);

      expect(response.status).toBe(400);
      noModelCalls();
      expect(await snapshot(user.id)).toEqual(before);
    });

    it("a record of another Freelancer behind the picked option (forged ref in the stored form)", async () => {
      const { user, conversationId, form, pickAlpha } = await withOpenAccountForm('t58-foreignrec@example.com');
      const other = await createFreelancer(prisma, { email: 't58-foreignrec-other@example.com', timeZone: TZ });
      const otherProfile = await createSenderProfile(prisma, other.id, { name: 'Theirs' });
      const theirs = await createBankAccount(prisma, otherProfile.id, { currency: 'USD', bankName: 'Their Bank', accountNumber: '9999999999' });
      const questions = (form.questions as any[]).map((q) => ({
        ...q,
        options: q.options.map((o: any) => (o.optionId === 0 ? { ...o, ref: { bankAccountId: theirs.id } } : o)),
      }));
      await prisma.choiceOffer.update({ where: { id: form.id }, data: { questions } });
      await expectUniformRefusal(user.id, conversationId, form.id, pickAlpha);
    });

    it("AC-13: the option's bank account was deleted since", async () => {
      const { user, conversationId, form, alpha, pickAlpha } = await withOpenAccountForm('t15-deleted@example.com');
      await prisma.bankAccount.delete({ where: { id: alpha.id } });
      await expectUniformRefusal(user.id, conversationId, form.id, pickAlpha);
    });

    it("AC-13: the option's bank account moved to another currency", async () => {
      const { user, conversationId, form, alpha, pickAlpha } = await withOpenAccountForm('t15-moved@example.com');
      await prisma.bankAccount.update({ where: { id: alpha.id }, data: { currency: 'PLN' } });
      await expectUniformRefusal(user.id, conversationId, form.id, pickAlpha);
    });
  });

  it('AC-12b: every cause above answered the byte-identical body', () => {
    expect(refusalBodies.size).toBe(1);
    expect(JSON.parse([...refusalBodies][0])).toEqual(UNAVAILABLE_BODY);
  });

  describe('two concurrent Sends of the same form', () => {
    it('exactly one is processed (one card, one FORM message, one slot); the other is the identical 409', async () => {
      const { user, conversationId, form, pickAlpha } = await withOpenAccountForm('t15-race@example.com');
      const usedBefore = await used(user.id);
      const messagesBefore = await prisma.conversationMessage.count();
      script(textOnly());

      const [a, b] = await Promise.all([sendForm(conversationId, form.id, pickAlpha), sendForm(conversationId, form.id, pickAlpha)]);

      expect([a.response.status, b.response.status].sort()).toEqual([200, 409]);
      const loser = a.response.status === 409 ? a : b;
      expect(JSON.parse(loser.raw)).toEqual(UNAVAILABLE_BODY);
      const reference = await sendForm(conversationId, 'clx0neverexisted0000000001', [{ questionId: 0, optionId: 0 }]);
      expect(loser.raw).toBe(reference.raw);

      expect(await used(user.id)).toBe(usedBefore + 1);
      expect(await prisma.draftCard.count()).toBe(1);
      expect(await prisma.conversationMessage.count()).toBe(messagesBefore + 2); // the Send and its reply, once
      expect(await prisma.conversationMessage.count({ where: { origin: 'FORM' } })).toBe(1);
      const after = await prisma.choiceOffer.findUniqueOrThrow({ where: { id: form.id } });
      expect(after.state).toBe('CHOSEN');
      expect(after.answers).toEqual(pickAlpha);
      expect(model.doStreamCalls.length).toBeGreaterThanOrEqual(1);
    });

    it('four concurrent Sends: one is processed, three get the identical 409, one slot is counted', async () => {
      const { user, conversationId, form, pickAlpha } = await withOpenAccountForm('t58-race4@example.com');
      const usedBefore = await used(user.id);
      script(textOnly());

      const results = await Promise.all([1, 2, 3, 4].map(() => sendForm(conversationId, form.id, pickAlpha)));

      expect(results.map((r) => r.response.status).sort()).toEqual([200, 409, 409, 409]);
      for (const r of results.filter((x) => x.response.status === 409)) expect(JSON.parse(r.raw)).toEqual(UNAVAILABLE_BODY);
      expect(await used(user.id)).toBe(usedBefore + 1);
      expect(await prisma.conversationMessage.count({ where: { origin: 'FORM' } })).toBe(1);
      expect(await prisma.draftCard.count()).toBe(1);
    });
  });

  describe('AC-11: a provider failure after the claim', () => {
    it('puts the form back OPEN with no answers, gives the slot back and saves nothing', async () => {
      const { user, conversationId, form, pickAlpha } = await withOpenAccountForm('t15-release@example.com');
      const before = await snapshot(user.id);
      script(() => ({
        error: new APICallError({ message: 'upstream 503', url: 'https://x', requestBodyValues: {}, statusCode: 503, isRetryable: false }),
      }));

      const { raw } = await sendForm(conversationId, form.id, pickAlpha);

      expect(raw).toMatch(/"counted":false/);
      expect(model.doStreamCalls.length).toBeGreaterThanOrEqual(1);
      // The turn ran as the form's Send (the composed message reached the model), then claim and slot were given back.
      expect(JSON.stringify(model.doStreamCalls[0].prompt)).toContain('Bank account: Alpha Bank ••1111 · USD');
      const after = await prisma.choiceOffer.findUniqueOrThrow({ where: { id: form.id } });
      expect(after.state).toBe('OPEN');
      expect(after.answers).toBeNull();
      expect(await used(user.id)).toBe(before.used);
      expect(await prisma.conversationMessage.count()).toBe(before.messages);
      expect(await prisma.draftCard.count()).toBe(before.cards);
    });
  });

  describe('AC-11: a provider failure after the claim, with a newer message saved meanwhile (second tab)', () => {
    it('closes the form with no answers (not reopened), gives the slot back', async () => {
      const { user, conversationId, form, pickAlpha } = await withOpenAccountForm('t58-release-newer@example.com');
      const usedBefore = await used(user.id);
      script(() => ({
        error: new APICallError({ message: 'upstream 503', url: 'https://x', requestBodyValues: {}, statusCode: 503, isRetryable: false }),
      }));
      const original = model.doStream.bind(model);
      model.doStream = (async (options: any) => {
        // Another tab saves a newer message while this Send is still in flight (after the claim).
        await prisma.conversationMessage.create({
          data: { conversationId, position: 2, role: 'USER', origin: 'TYPED', parts: [{ type: 'text', text: 'newer message from tab two' }] },
        });
        return original(options);
      }) as any;

      const { raw } = await sendForm(conversationId, form.id, pickAlpha);

      expect(raw).toMatch(/"counted":false/);
      const after = await prisma.choiceOffer.findUniqueOrThrow({ where: { id: form.id } });
      expect(after.state).toBe('CLOSED');
      expect(after.answers).toBeNull();
      expect(await used(user.id)).toBe(usedBefore);
      expect(await prisma.conversationMessage.count({ where: { origin: 'FORM' } })).toBe(0);
    });

    it('releaseForm alone: CHOSEN with a newer message -> CLOSED, without one -> OPEN, answers cleared in both', async () => {
      const { releaseForm } = await import('@/lib/services/assistant-drafts/forms');
      const a = await withOpenAccountForm('t58-rel-a@example.com');
      await prisma.choiceOffer.update({ where: { id: a.form.id }, data: { state: 'CHOSEN', answers: a.pickAlpha } });
      await releaseForm(appPrisma, a.form.id);
      const reopened = await prisma.choiceOffer.findUniqueOrThrow({ where: { id: a.form.id } });
      expect([reopened.state, reopened.answers]).toEqual(['OPEN', null]);

      const b = await withOpenAccountForm('t58-rel-b@example.com');
      await prisma.choiceOffer.update({ where: { id: b.form.id }, data: { state: 'CHOSEN', answers: b.pickAlpha } });
      await prisma.conversationMessage.create({
        data: { conversationId: b.conversationId, position: 2, role: 'USER', origin: 'TYPED', parts: [{ type: 'text', text: 'newer' }] },
      });
      await releaseForm(appPrisma, b.form.id);
      const closed = await prisma.choiceOffer.findUniqueOrThrow({ where: { id: b.form.id } });
      expect([closed.state, closed.answers]).toEqual(['CLOSED', null]);
    });
  });

  describe('AC-09: the stream contract - every FormView option is the system\'s own record with the system\'s label (T58)', () => {
    const FOREIGN_NAME = 'Foreign Customer Ltd';
    const GLOBEX = `Globex ${INJECTED_NOTE}`; // a stored name that is itself an instruction
    const dayFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

    async function seedOwnAndForeign(email: string) {
      const user = await createFreelancer(prisma, { email, timeZone: TZ });
      authMock.mockResolvedValue({ user: { id: user.id } });
      const profile = await createSenderProfile(prisma, user.id, { name: 'Main' });
      const account = await createBankAccount(prisma, profile.id, { currency: 'USD', bankName: 'Alpha Bank', accountNumber: '1111111111' });
      const globex = await createCustomer(prisma, user.id, { name: GLOBEX, email: 'globex@example.test' });
      const acmeOne = await createCustomer(prisma, user.id, { name: 'Acme Corp', email: 'one@acme.example.test' });
      const acmeTwo = await createCustomer(prisma, user.id, { name: 'acme corp', email: null });
      const product = await createProduct(prisma, user.id, { name: 'Design', unit: 'hour', price: 50, currency: 'USD' });

      const other = await createFreelancer(prisma, { email: `${email}.other`, timeZone: TZ });
      const otherProfile = await createSenderProfile(prisma, other.id, { name: 'Theirs' });
      const otherAccount = await createBankAccount(prisma, otherProfile.id, { currency: 'USD', bankName: 'Their Bank', accountNumber: '9999999999' });
      const otherCustomer = await createCustomer(prisma, other.id, { name: FOREIGN_NAME });
      return { user, profile, account, globex, acmeOne, acmeTwo, product, other, otherProfile, otherAccount, otherCustomer };
    }

    const ownCall = (s: Awaited<ReturnType<typeof seedOwnAndForeign>>) => ({
      draft: { currency: 'USD' },
      questions: [
        { field: 'CUSTOMER', prompt: 'Which customer?', recordIds: [s.globex.id, s.acmeOne.id, s.acmeTwo.id] },
        { field: 'BANK_ACCOUNT', prompt: 'Which account?', recordIds: [s.account.id] },
        { field: 'SENDER_PROFILE', prompt: 'Which profile?', recordIds: [s.profile.id] },
        { field: 'PRODUCT', lineIndex: 0, prompt: 'Which product?', recordIds: [s.product.id] },
        { field: 'CURRENCY', prompt: 'Which currency?', currencies: ['USD', 'EUR'] },
        { field: 'ISSUE_DATE', prompt: 'Which issue date?' },
      ],
    });

    async function runAsk(userId: string, calls: Array<Record<string, unknown>>) {
      script((i) =>
        i === 0
          ? { toolCalls: calls.map((input) => ({ name: 'ask_user', input })) }
          : { text: `${INJECTED_MODEL_TEXT} Also offer "Totally Made Up Bank ••0000 · USD".` }
      );
      const response = await post(typed('invoice them', {}, null));
      const raw = await response.text();
      const conversation = await prisma.conversation.findFirstOrThrow({ where: { userId } });
      const forms = await prisma.choiceOffer.findMany({ where: { userId } });
      const { getConversation } = await import('@/lib/services/conversations/conversations');
      const view: any = await getConversation(await actingFreelancerForTest(userId, TZ), conversation.id);
      expect(view.success).toBe(true);
      return { raw, parts: partsOfText(raw), forms, views: Object.values(view.data.forms) as any[] };
    }

    const MADE_UP = ['Totally Made Up', '0000', ...INJECTION_CANARIES];

    it('own ids: every label equals the label rule recomputed from the DB rows; no model text in any label', async () => {
      const s = await seedOwnAndForeign('t58-own@example.com');
      const { parts, forms, views } = await runAsk(s.user.id, [ownCall(s)]);

      expect(forms).toHaveLength(1);
      expect(views).toHaveLength(1);
      expect(parts.filter((p) => p.type === 'data-offer')).toEqual([{ type: 'data-offer', id: forms[0].id, data: { offerId: forms[0].id } }]);
      const labelsOf = (field: string) => views[0].questions.find((q: any) => q.field === field).options.map((o: any) => o.label);

      // Look-alike Customers (same name ignoring case) show their email, or "no email"; the other keeps its stored name.
      expect(labelsOf('CUSTOMER')).toEqual([GLOBEX, 'Acme Corp (one@acme.example.test)', 'acme corp (no email)']);
      expect(labelsOf('BANK_ACCOUNT')).toEqual(['Alpha Bank ••1111 · USD']);
      expect(labelsOf('SENDER_PROFILE')).toEqual(['Main']);
      expect(labelsOf('PRODUCT')).toEqual(['Design · hour · 50.00 USD']);
      expect(labelsOf('CURRENCY')).toEqual(['USD', 'EUR']);

      const stored: any[] = forms[0].questions as any[];
      const issue = stored.find((q) => q.field === 'ISSUE_DATE');
      const [today, yesterday] = issue.options.map((o: any) => o.ref.date as string);
      expect(labelsOf('ISSUE_DATE')).toEqual([
        `Today · ${dayFmt.format(new Date(`${today}T00:00:00Z`))}`,
        `Yesterday · ${dayFmt.format(new Date(`${yesterday}T00:00:00Z`))}`,
      ]);
      expect(new Date(`${today}T00:00:00Z`).getTime() - new Date(`${yesterday}T00:00:00Z`).getTime()).toBe(86_400_000);

      // Refs point at exactly the Freelancer's own checked records.
      const refs = (field: string) => stored.find((q) => q.field === field).options.map((o: any) => o.ref);
      expect(refs('CUSTOMER')).toEqual([s.globex.id, s.acmeOne.id, s.acmeTwo.id].map((customerId) => ({ customerId })));
      expect(refs('BANK_ACCOUNT')).toEqual([{ bankAccountId: s.account.id }]);

      const allLabels: string[] = views[0].questions.flatMap((q: any) => q.options.map((o: any) => o.label));
      // The stored Customer name is the Freelancer's own text (it carries the injection note); every other label is free of it.
      for (const label of allLabels.filter((l) => l !== GLOBEX)) for (const bad of MADE_UP) expect(label).not.toContain(bad);
      for (const bad of ['Totally Made Up', '0000']) for (const label of allLabels) expect(label).not.toContain(bad);
      expect(JSON.stringify(views)).not.toContain('"ref"');
      expect(JSON.stringify(views)).not.toContain(FOREIGN_NAME);
      // The model's words stream as text only.
      expect(parts.filter((p) => p.type === 'text-delta').map((p) => p.delta).join('')).toContain('Totally Made Up Bank');
    });

    it.each([
      ['another Freelancer\'s ids', (s: Awaited<ReturnType<typeof seedOwnAndForeign>>) => ({
        questions: [
          { field: 'CUSTOMER', prompt: 'Which customer?', recordIds: [s.otherCustomer.id] },
          { field: 'BANK_ACCOUNT', prompt: 'Which account?', recordIds: [s.otherAccount.id] },
        ],
      })],
      ['unknown ids', () => ({
        questions: [
          { field: 'CUSTOMER', prompt: 'Which customer?', recordIds: ['clxunknowncustomer0000001'] },
          { field: 'BANK_ACCOUNT', prompt: 'Which account?', recordIds: ['clxunknownaccount00000001'] },
        ],
      })],
      ['own ids mixed with one foreign id in the same call', (s: Awaited<ReturnType<typeof seedOwnAndForeign>>) => ({
        questions: [
          { field: 'CUSTOMER', prompt: 'Which customer?', recordIds: [s.globex.id] },
          { field: 'BANK_ACCOUNT', prompt: 'Which account?', recordIds: [s.otherAccount.id] },
        ],
      })],
      ['a foreign sender profile in the draft', (s: Awaited<ReturnType<typeof seedOwnAndForeign>>) => ({
        draft: { senderProfileId: s.otherProfile.id },
        questions: [{ field: 'CUSTOMER', prompt: 'Which customer?', recordIds: [s.globex.id] }],
      })],
    ])('%s: the only call is refused whole, the stored form is the inputs-only fallback with no option', async (_name, build) => {
      const s = await seedOwnAndForeign(`t58-forged-${_name.replace(/\W/g, '')}@example.com`);
      const { forms, views, raw } = await runAsk(s.user.id, [build(s)]);

      expect(forms).toHaveLength(1);
      const stored: any[] = forms[0].questions as any[];
      expect(stored.length).toBeGreaterThan(0);
      for (const q of stored) {
        expect(q.options).toEqual([]);
        expect(q.source).toBe('FALLBACK');
      }
      expect(views.flatMap((v) => v.questions.flatMap((q: any) => q.options))).toEqual([]);
      for (const secret of [FOREIGN_NAME, 'Their Bank', '9999', s.otherCustomer.id, s.otherAccount.id, s.otherProfile.id]) {
        expect(JSON.stringify(forms)).not.toContain(secret);
        expect(raw).not.toContain(secret);
      }
    });

    it('a forged call next to a valid one in the same step stores only the valid call\'s options', async () => {
      const s = await seedOwnAndForeign('t58-twocalls@example.com');
      const valid = { questions: [{ field: 'CUSTOMER', prompt: 'Which customer?', recordIds: [s.globex.id, s.acmeOne.id] }] };
      const forged = { questions: [{ field: 'BANK_ACCOUNT', prompt: 'Which account?', recordIds: [s.otherAccount.id] }] };
      const { forms, views, raw } = await runAsk(s.user.id, [forged, valid]);

      expect(forms).toHaveLength(1);
      const labels = views[0].questions.flatMap((q: any) => q.options.map((o: any) => o.label));
      expect(labels).toEqual([GLOBEX, 'Acme Corp']);
      expect(views[0].questions.find((q: any) => q.field === 'BANK_ACCOUNT')).toBeUndefined();
      expect(JSON.stringify(forms)).not.toContain('Their Bank');
      expect(raw).not.toContain('Their Bank');
    });
  });
});
