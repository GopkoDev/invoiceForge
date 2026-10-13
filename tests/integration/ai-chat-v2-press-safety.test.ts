// T15 (ai-chat-v2, AC-11, AC-12b, AC-13; QG-1; sad.md §10): the press safety properties through POST /api/chat.
// Every cause of an unavailable option answers a byte-identical 409 with no model call, no slot, no saved message and no
// offer change; two concurrent presses of one option process exactly once; a provider failure after the claim releases
// both the claim and the slot. The model is the scripted stand-in; its call count is asserted.
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
import { createChoiceOffer } from './../support/factories/choice-offer';
import { scriptedModel, type StubStep } from './../support/ai-stub-model';

const authMock = vi.fn<() => Promise<{ user: { id: string } } | null>>();
vi.mock('@/auth', () => ({ auth: () => authMock() }));

let model: MockLanguageModelV4;
vi.mock('@/lib/ai/model', () => ({ getChatModel: () => model }));

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

const TZ = 'Europe/Kyiv';
const LINES = [{ description: 'Consulting', quantity: '20', price: '50' }];
const UNAVAILABLE_BODY = {
  success: false,
  code: 'CONFLICT',
  error: 'This form is no longer available. Answer the latest questions or type your request.',
  details: { kind: 'CHOICE_UNAVAILABLE' },
};

describe.runIf(containerRuntimeAvailable)('press safety: uniform refusals, one claim, release on failure (T15)', () => {
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
  const proposeGlobex = (i: number): StubStep =>
    i === 0
      ? { toolCall: { name: 'propose_draft', input: { customer: 'Globex', currency: 'USD', lines: LINES } } }
      : { text: 'Which account?' };
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
  async function sendPress(conversationId: string, offerId: string, optionId: number) {
    const response = await post(typed('something else', { choice: { offerId, optionId } }, conversationId));
    const raw = await response.text();
    return { response, raw };
  }

  const used = async (userId: string) => (await prisma.messageAllowanceDay.findFirst({ where: { userId } }))?.used ?? 0;
  const snapshot = async (userId: string) => ({
    used: await used(userId),
    messages: await prisma.conversationMessage.count(),
    offers: await prisma.choiceOffer.findMany({ orderBy: { id: 'asc' } }),
    cards: await prisma.draftCard.count(),
  });

  /** One Freelancer: EUR default + two USD accounts, Customer Globex; a first typed turn leaves one OPEN BANK_ACCOUNT offer. */
  async function withOpenAccountOffer(email: string) {
    const user = await createFreelancer(prisma, { email, timeZone: TZ });
    authMock.mockResolvedValue({ user: { id: user.id } });
    const profile = await createSenderProfile(prisma, user.id, { name: 'Main' });
    await createBankAccount(prisma, profile.id, { currency: 'EUR', bankName: 'Euro Bank', accountNumber: '5555555555' });
    const alpha = await createBankAccount(prisma, profile.id, { currency: 'USD', bankName: 'Alpha Bank', accountNumber: '1111111111' });
    const beta = await createBankAccount(prisma, profile.id, { currency: 'USD', bankName: 'Beta Bank', accountNumber: '2222222222' });
    await createCustomer(prisma, user.id, { name: 'Globex' });
    script(proposeGlobex);
    await (await post(typed('invoice Globex 20 hours at $50 in USD'))).text(); // the turn runs while the stream is read
    const conversationId = (await prisma.conversation.findFirstOrThrow()).id;
    const offer = await prisma.choiceOffer.findFirstOrThrow({ where: { state: 'OPEN' } });
    expect(offer.kind).toBe('BANK_ACCOUNT');
    const optionOf = (bankAccountId: string) => (offer.options as any[]).find((o) => o.ref.bankAccountId === bankAccountId).optionId as number;
    return { user, profile, alpha, beta, conversationId, offer, optionOf };
  }

  /** Presses `offerId`/`optionId`, then asserts the uniform refusal and that nothing moved. */
  async function expectUniformRefusal(userId: string, conversationId: string, offerId: string, optionId: number) {
    const before = await snapshot(userId);
    script(textOnly());
    const reference = await sendPress(conversationId, 'clx0neverexisted0000000001', 0);
    const result = await sendPress(conversationId, offerId, optionId);

    expect(result.response.status).toBe(409);
    expect(JSON.parse(result.raw)).toEqual(UNAVAILABLE_BODY);
    expect(result.raw).toBe(reference.raw);
    noModelCalls();
    expect(await snapshot(userId)).toEqual(before);
  }

  describe('AC-12b, AC-13: every cause of an unavailable option gives the same 409 and changes nothing', () => {
    it('an option from an older (CLOSED) reply', async () => {
      const { user, conversationId, offer } = await withOpenAccountOffer('t15-closed@example.com');
      await prisma.choiceOffer.update({ where: { id: offer.id }, data: { state: 'CLOSED' } });
      await expectUniformRefusal(user.id, conversationId, offer.id, 0);
    });

    it('another Freelancer\'s offer', async () => {
      const { user, conversationId } = await withOpenAccountOffer('t15-foreign@example.com');
      const other = await createFreelancer(prisma, { email: 't15-foreign-other@example.com', timeZone: TZ });
      const conversation = await createConversation(prisma, {
        userId: other.id,
        messages: [{ role: 'USER', text: 'hi' }, { role: 'ASSISTANT', text: 'Which one?' }],
      });
      const foreign = await createChoiceOffer(prisma, { userId: other.id, conversationId: conversation.id, messageId: conversation.messages[1].id });
      await expectUniformRefusal(user.id, conversationId, foreign.id, 1);
    });

    it('an offer that never existed', async () => {
      const { user, conversationId } = await withOpenAccountOffer('t15-never@example.com');
      await expectUniformRefusal(user.id, conversationId, 'clx0neverexisted0000000002', 0);
    });

    it('an offer that is already CHOSEN', async () => {
      const { user, conversationId, offer, alpha, optionOf } = await withOpenAccountOffer('t15-chosen@example.com');
      await prisma.choiceOffer.update({ where: { id: offer.id }, data: { state: 'CHOSEN', chosenOptionId: optionOf(alpha.id) } });
      await expectUniformRefusal(user.id, conversationId, offer.id, optionOf(alpha.id));
    });

    it('AC-13: the option\'s bank account was deleted since', async () => {
      const { user, conversationId, offer, alpha, optionOf } = await withOpenAccountOffer('t15-deleted@example.com');
      const optionId = optionOf(alpha.id);
      await prisma.bankAccount.delete({ where: { id: alpha.id } });
      await expectUniformRefusal(user.id, conversationId, offer.id, optionId);
    });

    it('AC-13: the option\'s bank account moved to another currency', async () => {
      const { user, conversationId, offer, alpha, optionOf } = await withOpenAccountOffer('t15-moved@example.com');
      const optionId = optionOf(alpha.id);
      await prisma.bankAccount.update({ where: { id: alpha.id }, data: { currency: 'PLN' } });
      await expectUniformRefusal(user.id, conversationId, offer.id, optionId);
    });
  });

  describe('two concurrent presses of the same option', () => {
    it('exactly one is processed (one card, one PRESSED message, one slot); the other is the identical 409', async () => {
      const { user, conversationId, offer, alpha, optionOf } = await withOpenAccountOffer('t15-race@example.com');
      const usedBefore = await used(user.id);
      const messagesBefore = await prisma.conversationMessage.count();
      script(textOnly());
      const optionId = optionOf(alpha.id);

      const [a, b] = await Promise.all([sendPress(conversationId, offer.id, optionId), sendPress(conversationId, offer.id, optionId)]);

      const statuses = [a.response.status, b.response.status].sort();
      expect(statuses).toEqual([200, 409]);
      const loser = a.response.status === 409 ? a : b;
      expect(JSON.parse(loser.raw)).toEqual(UNAVAILABLE_BODY);
      const reference = await sendPress(conversationId, 'clx0neverexisted0000000001', 0);
      expect(loser.raw).toBe(reference.raw);

      expect(await used(user.id)).toBe(usedBefore + 1);
      expect(await prisma.draftCard.count()).toBe(1);
      expect(await prisma.conversationMessage.count()).toBe(messagesBefore + 2); // the press and its reply, once
      expect(await prisma.conversationMessage.count({ where: { origin: 'PRESSED' } })).toBe(1);
      const after = await prisma.choiceOffer.findUniqueOrThrow({ where: { id: offer.id } });
      expect(after.state).toBe('CHOSEN');
      expect(after.chosenOptionId).toBe(optionId);
      expect(model.doStreamCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('AC-11: a provider failure after the claim', () => {
    it('puts the offer back OPEN with no chosen option, gives the slot back and saves nothing', async () => {
      const { user, conversationId, offer, alpha, optionOf } = await withOpenAccountOffer('t15-release@example.com');
      const before = await snapshot(user.id);
      script(() => ({
        error: new APICallError({ message: 'upstream 503', url: 'https://x', requestBodyValues: {}, statusCode: 503, isRetryable: false }),
      }));

      const { raw } = await sendPress(conversationId, offer.id, optionOf(alpha.id));

      expect(raw).toMatch(/"counted":false/);
      expect(model.doStreamCalls.length).toBeGreaterThanOrEqual(1);
      const after = await prisma.choiceOffer.findUniqueOrThrow({ where: { id: offer.id } });
      expect(after.state).toBe('OPEN');
      expect(after.chosenOptionId).toBeNull();
      expect(await used(user.id)).toBe(before.used);
      expect(await prisma.conversationMessage.count()).toBe(before.messages);
      expect(await prisma.draftCard.count()).toBe(before.cards);
    });
  });
});
