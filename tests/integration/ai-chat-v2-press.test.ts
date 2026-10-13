// T14 (ai-chat-v2, AC-08, AC-08b, AC-10, AC-11, AC-12b, AC-29, AC-36; ADR-0003; server-actions.md §Route order for a press):
// POST /api/chat with a `choice`, `origin` and `startedFrom`. Order: session, body, Conversation owner, checkChoice (409,
// before the allowance), reserve slot + claim (429 / 409), pinned turn, saveTurn with the stored label and PRESSED. The model
// is the scripted stand-in; its call count is asserted in every test.
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
import { partsOfText, scriptedModel, type StubStep } from './../support/ai-stub-model';

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
  error: 'This option is no longer available. Choose again or type your request.',
  details: { kind: 'CHOICE_UNAVAILABLE' },
};

describe.runIf(containerRuntimeAvailable)('a button press is a counted message that refers to exactly the record pressed (T14)', () => {
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
  function script(step: (i: number) => StubStep) {
    model = scriptedModel({ verdict: { topic: 'in_scope', language: 'en', intent: 'draft' }, steps: (i) => step(i) });
  }
  const propose = (customer: string) => (i: number): StubStep =>
    i === 0
      ? { toolCall: { name: 'propose_draft', input: { customer, currency: 'USD', lines: LINES } } }
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
  const pressBody = (conversationId: string | null, offerId: string, optionId: number, text = 'something else') =>
    typed(text, { choice: { offerId, optionId } }, conversationId);

  async function sendTyped(text: string, extra: Record<string, unknown> = {}, conversationId: string | null = null) {
    const response = await post(typed(text, extra, conversationId));
    return partsOfText(await response.text());
  }
  async function sendPress(conversationId: string | null, offerId: string, optionId: number, text?: string) {
    const response = await post(pressBody(conversationId, offerId, optionId, text));
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
  /** One USD account on the default profile: once the Customer is pinned, the draft is complete (AC-08, AC-10). */
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
  const latestOpenOffer = async () => prisma.choiceOffer.findFirstOrThrow({ where: { state: 'OPEN' }, orderBy: { createdAt: 'desc' } });
  const optionFor = (offer: any, match: (o: any) => boolean) => (offer.options as any[]).find(match);
  const lastUserMessage = () => prisma.conversationMessage.findFirstOrThrow({ where: { role: 'USER' }, orderBy: { position: 'desc' } });
  const conversationOf = async () => (await prisma.conversation.findFirstOrThrow()).id;

  /** A first typed turn through the route: leaves a saved Conversation with one OPEN offer on its latest reply. */
  async function firstTurnWithOffer(customer = 'Acme') {
    script(propose(customer));
    await sendTyped('invoice Acme for 20 hours at $50');
    return { conversationId: await conversationOf(), offer: await latestOpenOffer() };
  }

  describe('AC-08: pressing a Customer', () => {
    it('AC-08: pressing "Acme GmbH" saves the stored label as the message, marks the offer chosen and shows the card for exactly that Customer', async () => {
      const user = await freelancer('t14-ac08@example.com');
      await profileWithOneUsdAccount(user.id);
      const { gmbh } = await acmePair(user.id);
      const { conversationId, offer } = await firstTurnWithOffer();
      expect(offer.kind).toBe('CUSTOMER');
      const option = optionFor(offer, (o) => o.label === 'Acme GmbH');
      const usedBefore = await used(user.id);
      script(textOnly());

      const { response, parts } = await sendPress(conversationId, offer.id, option.optionId, 'something else');

      expect(response.status).toBe(200);
      expect(streamCalls()).toBeGreaterThanOrEqual(1);
      const cards = await prisma.draftCard.findMany();
      const customerIssueIsPinned = cards.length === 1 ? (cards[0].proposal as any).customer.customerId : null;
      expect(customerIssueIsPinned).toBe(gmbh.id);
      expect(parts.some((p) => p.type === 'data-draft-card')).toBe(true);
      const after = await prisma.choiceOffer.findUniqueOrThrow({ where: { id: offer.id } });
      expect(after.state).toBe('CHOSEN');
      expect(after.chosenOptionId).toBe(option.optionId);
      const message = await lastUserMessage();
      expect((message.parts as any[])[0].text).toBe('Acme GmbH');
      expect(message.origin).toBe('PRESSED');
      expect(await used(user.id)).toBe(usedBefore + 1);
    });
  });

  describe('AC-08b: Customer, then account', () => {
    it('AC-08b: the Customer press offers the two USD accounts; pressing one gives the card for Acme GmbH with that account; two slots for two presses', async () => {
      const user = await freelancer('t14-ac08b@example.com');
      const { alpha } = await profileWithAccounts(user.id);
      const { gmbh } = await acmePair(user.id);
      const { conversationId, offer } = await firstTurnWithOffer();
      expect(offer.kind).toBe('CUSTOMER');
      const usedBefore = await used(user.id);

      script(textOnly('Which account?'));
      const first = await sendPress(conversationId, offer.id, optionFor(offer, (o) => o.label === 'Acme GmbH').optionId);
      expect(first.response.status).toBe(200);
      expect(streamCalls()).toBeGreaterThanOrEqual(1);
      expect(await prisma.draftCard.count()).toBe(0);
      const next = await latestOpenOffer();
      expect(next.id).not.toBe(offer.id);
      expect(next.kind).toBe('BANK_ACCOUNT');
      expect((next.options as any[]).map((o) => o.label)).toEqual(['Alpha Bank ••1111 · USD', 'Beta Bank ••2222 · USD']);

      script(textOnly('Here is the draft.'));
      const second = await sendPress(conversationId, next.id, optionFor(next, (o) => o.ref.bankAccountId === alpha.id).optionId);
      expect(second.response.status).toBe(200);
      expect(streamCalls()).toBeGreaterThanOrEqual(1);
      const cards = await prisma.draftCard.findMany();
      expect(cards).toHaveLength(1);
      const proposal: any = cards[0].proposal;
      expect(proposal.customer.customerId).toBe(gmbh.id);
      expect(JSON.stringify(proposal)).toContain(alpha.id);
      expect(await used(user.id)).toBe(usedBefore + 2);
    });
  });

  describe('AC-10: look-alike Customers', () => {
    it('AC-10: pressing the Cyrillic "Аcme Corp" continues with exactly that Customer', async () => {
      const user = await freelancer('t14-ac10@example.com');
      await profileWithOneUsdAccount(user.id);
      await createCustomer(prisma, user.id, { name: 'Acme Corp', email: 'ap@acme-us.example.test' });
      const cyrillic = await createCustomer(prisma, user.id, { name: 'Аcme Corp', email: 'ap@acme-ua.example.test' });
      const { conversationId, offer } = await firstTurnWithOffer('Acme Corp');
      expect(offer.kind).toBe('CUSTOMER');
      const option = optionFor(offer, (o) => o.ref.customerId === cyrillic.id);
      script(textOnly());

      const { response } = await sendPress(conversationId, offer.id, option.optionId);

      expect(response.status).toBe(200);
      expect(streamCalls()).toBeGreaterThanOrEqual(1);
      const cards = await prisma.draftCard.findMany();
      expect(cards).toHaveLength(1);
      expect((cards[0].proposal as any).customer.customerId).toBe(cyrillic.id);
    });
  });

  describe('AC-11: the last message of the day', () => {
    it('AC-11: with 29 used the press counts (30); the next reply\'s press is 429, its offer stays OPEN, and the model is not called for it', async () => {
      const user = await freelancer('t14-ac11@example.com');
      await profileWithAccounts(user.id);
      await acmePair(user.id);
      const { conversationId, offer } = await firstTurnWithOffer();
      await prisma.messageAllowanceDay.updateMany({ where: { userId: user.id }, data: { used: 29 } });

      script(textOnly('Which account?'));
      const first = await sendPress(conversationId, offer.id, optionFor(offer, (o) => o.label === 'Acme GmbH').optionId);
      expect(first.response.status).toBe(200);
      expect(streamCalls()).toBeGreaterThanOrEqual(1);
      expect(await used(user.id)).toBe(30);
      expect((await prisma.choiceOffer.findUniqueOrThrow({ where: { id: offer.id } })).state).toBe('CHOSEN');
      const next = await latestOpenOffer();
      expect(next.kind).toBe('BANK_ACCOUNT');
      const messagesBefore = await prisma.conversationMessage.count();

      script(textOnly());
      const second = await sendPress(conversationId, next.id, 0);

      expect(second.response.status).toBe(429);
      const body = JSON.parse(second.raw);
      expect(body).toMatchObject({ success: false, code: 'RATE_LIMITED', details: { kind: 'ALLOWANCE_USED_UP' } });
      noModelCalls();
      const after = await prisma.choiceOffer.findUniqueOrThrow({ where: { id: next.id } });
      expect(after.state).toBe('OPEN');
      expect(after.chosenOptionId).toBeNull();
      expect(await used(user.id)).toBe(30);
      expect(await prisma.conversationMessage.count()).toBe(messagesBefore);
    });
  });

  describe('AC-12b: a press that cannot be applied', () => {
    it('AC-12b: an older (closed) option, another Freelancer\'s offer and a never-existing offer give byte-identical 409 bodies, no model call, no slot, no change', async () => {
      const user = await freelancer('t14-ac12b@example.com');
      await profileWithAccounts(user.id);
      await acmePair(user.id);
      const { conversationId, offer } = await firstTurnWithOffer();
      await prisma.choiceOffer.update({ where: { id: offer.id }, data: { state: 'CLOSED' } });

      const other = await createFreelancer(prisma, { email: 't14-ac12b-other@example.com', timeZone: TZ });
      const foreignConversation = await createConversation(prisma, {
        userId: other.id,
        messages: [{ role: 'USER', text: 'hi' }, { role: 'ASSISTANT', text: 'Which one?' }],
      });
      const foreignOffer = await createChoiceOffer(prisma, {
        userId: other.id,
        conversationId: foreignConversation.id,
        messageId: foreignConversation.messages[1].id,
      });

      const usedBefore = await used(user.id);
      const messagesBefore = await prisma.conversationMessage.count();
      const offersBefore = await prisma.choiceOffer.findMany({ orderBy: { id: 'asc' } });
      script(textOnly());

      const closed = await sendPress(conversationId, offer.id, 0);
      const foreign = await sendPress(conversationId, foreignOffer.id, 1);
      const missing = await sendPress(conversationId, 'clx0neverexisted0000000001', 0);

      for (const r of [closed, foreign, missing]) expect(r.response.status).toBe(409);
      expect(JSON.parse(closed.raw)).toEqual(UNAVAILABLE_BODY);
      expect(foreign.raw).toBe(closed.raw);
      expect(missing.raw).toBe(closed.raw);
      noModelCalls();
      expect(await used(user.id)).toBe(usedBefore);
      expect(await prisma.conversationMessage.count()).toBe(messagesBefore);
      expect(await prisma.choiceOffer.findMany({ orderBy: { id: 'asc' } })).toEqual(offersBefore);
    });

    it('an invalid press is 409 even when the allowance is used up (checked before the allowance)', async () => {
      const user = await freelancer('t14-409-first@example.com');
      await profileWithAccounts(user.id);
      await acmePair(user.id);
      const { conversationId } = await firstTurnWithOffer();
      await prisma.messageAllowanceDay.updateMany({ where: { userId: user.id }, data: { used: 30 } });
      script(textOnly());

      const { response, raw } = await sendPress(conversationId, 'clx0neverexisted0000000001', 0);

      expect(response.status).toBe(409);
      expect(JSON.parse(raw)).toEqual(UNAVAILABLE_BODY);
      noModelCalls();
      expect(await used(user.id)).toBe(30);
    });
  });

  describe('request validation', () => {
    it('a choice without a conversationId is 400 with the exact sentence; nothing counted, no model call', async () => {
      const user = await freelancer('t14-400@example.com');
      script(textOnly());

      const response = await post(pressBody(null, 'clx0offer000000000000001', 1));
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.code).toBe('VALIDATION');
      expect(body.fieldErrors.choice).toEqual(['A choice can only be sent in a saved conversation.']);
      noModelCalls();
      expect(await used(user.id)).toBe(0);
      expect(await prisma.conversation.count()).toBe(0);
    });
  });

  describe('release on failure', () => {
    it('a provider failure after the claim leaves the offer OPEN, the slot given back and nothing saved', async () => {
      const user = await freelancer('t14-release@example.com');
      await profileWithAccounts(user.id);
      await acmePair(user.id);
      const { conversationId, offer } = await firstTurnWithOffer();
      const usedBefore = await used(user.id);
      const messagesBefore = await prisma.conversationMessage.count();
      script(() => ({
        error: new APICallError({ message: 'upstream 503', url: 'https://x', requestBodyValues: {}, statusCode: 503, isRetryable: false }),
      }));

      const { raw } = await sendPress(conversationId, offer.id, optionFor(offer, (o) => o.label === 'Acme GmbH').optionId);

      expect(raw).toMatch(/"counted":false/);
      expect(streamCalls()).toBeGreaterThanOrEqual(1);
      const after = await prisma.choiceOffer.findUniqueOrThrow({ where: { id: offer.id } });
      expect(after.state).toBe('OPEN');
      expect(after.chosenOptionId).toBeNull();
      expect(await used(user.id)).toBe(usedBefore);
      expect(await prisma.conversationMessage.count()).toBe(messagesBefore);
      expect(await prisma.draftCard.count()).toBe(0);
    });
  });

  describe('AC-29: the dashboard prompt and start points', () => {
    it('AC-29: origin DASHBOARD + startedFrom DASHBOARD_PROMPT on a new Conversation is saved as such; one slot', async () => {
      const user = await freelancer('t14-ac29@example.com');
      script(textOnly('You have no overdue invoices.'));

      const parts = await sendTyped('who owes me money?', { origin: 'DASHBOARD', startedFrom: 'DASHBOARD_PROMPT' });

      expect(parts.some((p) => p.type === 'data-conversation')).toBe(true);
      expect(streamCalls()).toBe(1);
      expect((await prisma.conversation.findFirstOrThrow()).startedFrom).toBe('DASHBOARD_PROMPT');
      expect((await lastUserMessage()).origin).toBe('DASHBOARD');
      expect(await used(user.id)).toBe(1);
    });

    it('AC-29: startedFrom INVOICE_LIST alone gives a TYPED message and that start point', async () => {
      const user = await freelancer('t14-ac29b@example.com');
      script(textOnly('Done.'));

      await sendTyped('which invoices are overdue?', { startedFrom: 'INVOICE_LIST' });

      expect(streamCalls()).toBe(1);
      expect((await prisma.conversation.findFirstOrThrow()).startedFrom).toBe('INVOICE_LIST');
      expect((await lastUserMessage()).origin).toBe('TYPED');
      expect(await used(user.id)).toBe(1);
    });
  });

  describe('AC-36: no session', () => {
    it('AC-36: a press without a session is refused 401; nothing counted, no model call', async () => {
      authMock.mockResolvedValue(null);
      script(textOnly());

      const response = await post(pressBody('clx0conv0000000000000001', 'clx0offer000000000000001', 1));

      expect(response.status).toBe(401);
      noModelCalls();
      expect(await prisma.messageAllowanceDay.count()).toBe(0);
      expect(await prisma.conversationMessage.count()).toBe(0);
    });
  });
});
