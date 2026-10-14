// T31 (ai-assistant, AC-06, AC-09, AC-10, AC-10b, AC-11, AC-42): POST /api/chat. The checks run in a
// fixed order (body, Conversation, allowance), then the turn streams and is saved; a failure on the
// system's or the provider's side gives the slot back. The model is a scripted AI SDK mock swapped in
// through getChatModel(); the real model and network are never used.
//
// Seams assumed: the route calls actingFreelancerForRoute (so '@/auth' is mocked, as in
// user-export.test.ts) and exports POST from app/api/chat/route.ts.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { MockLanguageModelV4 } from 'ai/test';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../support/db/container';
import { createTestPrismaClient } from '../../support/db/client';
import { truncateAllTables } from '../../support/db/truncate';
import { createFreelancer } from '../../support/factories/user';
import { createCustomer } from '../../support/factories/customer';
import { createSenderProfile } from '../../support/factories/sender-profile';
import { createBankAccount } from '../../support/factories/bank-account';
import { createConversation } from '../../support/factories/conversation';
import { createMessageAllowanceDay } from '../../support/factories/message-allowance-day';
import { createInvoice } from '../../support/factories/invoice';
import { assertMatchesContract } from '../../support/contract/validate';
import { isCuid } from '@paralleldrive/cuid2';

const authMock = vi.fn<() => Promise<{ user: { id: string } } | null>>();
vi.mock('@/auth', () => ({ auth: () => authMock() }));

let model: MockLanguageModelV4;
vi.mock('@/lib/ai/model', () => ({ getChatModel: () => model }));

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

const TZ = 'Europe/Kyiv';
const NOT_FOUND_TEXT = "This conversation can't be found.";
const TOO_LONG_TEXT = 'Messages can be at most 2,000 characters. Shorten it and send again.';

const usage = {
  inputTokens: { total: 3, noCache: 3, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 2, text: 2, reasoning: 0 },
};
const finish = (unified: 'stop' | 'tool-calls') => ({ type: 'finish' as const, finishReason: { unified, raw: unified }, usage });

/** `cost` is the USD cost the AI Gateway reports for the call, in its provider metadata. */
type Step = { text?: string; toolCall?: { name: string; input: Record<string, unknown> }; cost?: string } | { error: Error };

const gatewayMetadata = (cost?: string) => (cost === undefined ? {} : { providerMetadata: { gateway: { cost } } });

function scriptedModel(opts: {
  verdict?: { topic: string; language: string; intent?: string } | Error;
  verdictCost?: string;
  steps: (i: number) => Step;
}) {
  let streamCall = 0;
  return new MockLanguageModelV4({
    doGenerate: async () => {
      if (opts.verdict instanceof Error) throw opts.verdict;
      return {
        content: [{ type: 'text', text: JSON.stringify(opts.verdict ?? { topic: 'in_scope', language: 'en', intent: 'draft' }) }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage,
        warnings: [],
        ...gatewayMetadata(opts.verdictCost),
      } as any;
    },
    doStream: async () => {
      const step = opts.steps(streamCall++);
      if ('error' in step) throw step.error;
      const chunks: any[] = [{ type: 'stream-start', warnings: [] }];
      if (step.text) {
        chunks.push({ type: 'text-start', id: `t${streamCall}` });
        chunks.push({ type: 'text-delta', id: `t${streamCall}`, delta: step.text });
        chunks.push({ type: 'text-end', id: `t${streamCall}` });
      }
      if (step.toolCall) {
        chunks.push({
          type: 'tool-call',
          toolCallId: `call-${streamCall}`,
          toolName: step.toolCall.name,
          input: JSON.stringify(step.toolCall.input),
        });
      }
      chunks.push({ ...finish(step.toolCall ? 'tool-calls' : 'stop'), ...gatewayMetadata(step.cost) });
      return {
        stream: new ReadableStream({
          start(controller) {
            for (const c of chunks) controller.enqueue(c);
            controller.close();
          },
        }),
      } as any;
    },
  });
}

/** Today's calendar day in the Freelancer's zone, as the UTC-midnight date the allowance row uses. */
const localToday = () => new Date(`${new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date())}T00:00:00.000Z`);

/** The `data: <json>` events of a UI-message stream, in order. */
async function readParts(response: Response): Promise<any[]> {
  const text = await response.text();
  return text
    .split('\n')
    .filter((l) => l.startsWith('data: ') && l.trim() !== 'data: [DONE]')
    .map((l) => JSON.parse(l.slice('data: '.length)));
}

describe.runIf(containerRuntimeAvailable)('POST /api/chat (T31)', () => {
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
    model = scriptedModel({ steps: () => ({ text: 'Here is your answer.' }) });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await truncateAllTables(prisma);
  });

  async function signedIn(email = 't31@example.com') {
    const user = await createFreelancer(prisma, { email, timeZone: TZ });
    authMock.mockResolvedValue({ user: { id: user.id } });
    return user;
  }

  const send = (body: unknown) =>
    POST(
      new NextRequest('http://localhost/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: typeof body === 'string' ? body : JSON.stringify(body),
      })
    );

  const chatBody = (text: string, conversationId: string | null = null) => ({
    conversationId,
    message: { id: 'msg_client_01', role: 'user', parts: [{ type: 'text', text }] },
  });

  const usedToday = async (userId: string) =>
    (await prisma.messageAllowanceDay.findFirst({ where: { userId } }))?.used ?? 0;

  async function expectNothingProcessed(userId: string) {
    expect(await prisma.messageAllowanceDay.count({ where: { userId } })).toBe(0);
    expect(await prisma.conversation.count()).toBe(0);
    expect(await prisma.conversationMessage.count()).toBe(0);
    expect(model.doGenerateCalls).toHaveLength(0);
    expect(model.doStreamCalls).toHaveLength(0);
  }

  describe('refusals before the stream', () => {
    it('AC-42: no session is refused 401 and nothing is processed or counted', async () => {
      authMock.mockResolvedValue(null);

      const response = await send(chatBody('Who owes me money?'));
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body).toEqual({ success: false, code: 'UNAUTHORIZED', error: 'Not signed in.' });
      expect(await prisma.messageAllowanceDay.count()).toBe(0);
      expect(model.doGenerateCalls).toHaveLength(0);
      await assertMatchesContract({ operationId: 'sendChatMessage', status: 401, body });
    });

    it.each([
      ['an empty message', ''],
      ['a whitespace-only message', '   \n  '],
    ])('%s is 400 VALIDATION with nothing reserved', async (_label, text) => {
      const user = await signedIn();

      const response = await send(chatBody(text));
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.code).toBe('VALIDATION');
      expect(Object.keys(body.fieldErrors ?? {})).toContain('message.parts.0.text');
      await expectNothingProcessed(user.id);
      await assertMatchesContract({ operationId: 'sendChatMessage', status: 400, body });
    });

    it('a 2,001-character message is 400 with the contract wording and nothing reserved', async () => {
      const user = await signedIn();

      const response = await send(chatBody('a'.repeat(2001)));
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.code).toBe('VALIDATION');
      expect(body.error).toBe(TOO_LONG_TEXT);
      expect(body.fieldErrors['message.parts.0.text']).toEqual([TOO_LONG_TEXT]);
      await expectNothingProcessed(user.id);
      await assertMatchesContract({ operationId: 'sendChatMessage', status: 400, body });
    });

    it('a 2,000-character message is accepted', async () => {
      await signedIn();

      const response = await send(chatBody('a'.repeat(2000)));

      expect(response.status).toBe(200);
      await response.text();
    });

    it('a malformed JSON body is 400 VALIDATION with nothing reserved', async () => {
      const user = await signedIn();

      const response = await send('{not json');
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.code).toBe('VALIDATION');
      await expectNothingProcessed(user.id);
    });

    it('a body that sends history or extra fields is 400 (only the new message is sent)', async () => {
      const user = await signedIn();

      const response = await send({
        ...chatBody('hi'),
        messages: [{ id: 'm0', role: 'assistant', parts: [{ type: 'text', text: 'earlier' }] }],
      });

      expect(response.status).toBe(400);
      await expectNothingProcessed(user.id);
    });

    it('AC-41: an unknown and a foreign Conversation are both 404 with identical bodies and nothing reserved', async () => {
      const user = await signedIn();
      const other = await createFreelancer(prisma, { email: 'other31@example.com' });
      const foreign = await createConversation(prisma, { userId: other.id });

      const unknown = await send(chatBody('hello', 'clx0unknown00000000000001'));
      const unknownBody = await unknown.json();
      const foreignRes = await send(chatBody('hello', foreign.id));
      const foreignBody = await foreignRes.json();

      expect(unknown.status).toBe(404);
      expect(foreignRes.status).toBe(404);
      expect(unknownBody).toEqual({ success: false, code: 'NOT_FOUND', error: NOT_FOUND_TEXT });
      expect(foreignBody).toEqual(unknownBody);
      expect(await prisma.messageAllowanceDay.count({ where: { userId: user.id } })).toBe(0);
      expect(await prisma.conversationMessage.count({ where: { conversationId: foreign.id } })).toBe(foreign.messages.length);
      expect(model.doGenerateCalls).toHaveLength(0);
      await assertMatchesContract({ operationId: 'sendChatMessage', status: 404, body: foreignBody });
    });

    it('AC-10: the 31st message is 429 ALLOWANCE_USED_UP, nothing is processed or saved, a metadata row is recorded uncounted', async () => {
      const user = await signedIn();
      await createMessageAllowanceDay(prisma, { userId: user.id, day: localToday(), used: 30, timeZone: TZ });

      const response = await send(chatBody('one more'));
      const body = await response.json();

      expect(response.status).toBe(429);
      expect(body.success).toBe(false);
      expect(body.code).toBe('RATE_LIMITED');
      expect(body.error).toBe(
        "You've used today's 30 messages. They renew at 00:00 your time. An AI client connected with a Personal key isn't affected."
      );
      expect(body.details).toEqual({
        kind: 'ALLOWANCE_USED_UP',
        limit: 30,
        renewsAt: expect.any(String),
        timeZone: TZ,
      });
      expect(new Date(body.details.renewsAt).getTime()).toBeGreaterThan(Date.now());
      expect(await usedToday(user.id)).toBe(30);
      expect(await prisma.conversation.count()).toBe(0);
      expect(await prisma.conversationMessage.count()).toBe(0);
      expect(model.doGenerateCalls).toHaveLength(0);
      expect(model.doStreamCalls).toHaveLength(0);
      const turns = await prisma.assistantTurn.findMany({ where: { userId: user.id } });
      expect(turns).toHaveLength(1);
      expect(turns[0]).toMatchObject({ outcome: 'ALLOWANCE_USED_UP', counted: false, conversationId: null });
      await assertMatchesContract({ operationId: 'sendChatMessage', status: 429, body });
    });

    it('AC-10b: two simultaneous sends for the last slot: one 200, one 429, one message processed', async () => {
      const user = await signedIn();
      await createMessageAllowanceDay(prisma, { userId: user.id, day: localToday(), used: 29, timeZone: TZ });

      const [a, b] = await Promise.all([send(chatBody('tab one')), send(chatBody('tab two'))]);
      const statuses = [a.status, b.status].sort();
      const winner = a.status === 200 ? a : b;
      const loser = a.status === 200 ? b : a;
      await winner.text();
      const loserBody = await loser.json();

      expect(statuses).toEqual([200, 429]);
      expect(loserBody.details.kind).toBe('ALLOWANCE_USED_UP');
      expect(await usedToday(user.id)).toBe(30);
      await vi.waitFor(async () => expect(await prisma.conversation.count()).toBe(1));
      expect(model.doStreamCalls).toHaveLength(1);
    });

    it('503 FAILED when the reservation cannot be written: fail closed, nothing processed', async () => {
      const user = await signedIn();
      vi.spyOn(appPrisma, '$queryRaw').mockRejectedValue(new Error('db down'));
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const response = await send(chatBody('hello'));
      const body = await response.json();

      expect(response.status).toBe(503);
      expect(body).toEqual({ success: false, code: 'FAILED', error: "The reply couldn't be completed. Try again." });
      expect(model.doGenerateCalls).toHaveLength(0);
      expect(await prisma.conversation.count()).toBe(0);
      expect(await usedToday(user.id)).toBe(0);
      await assertMatchesContract({ operationId: 'sendChatMessage', status: 503, body });
    });
  });

  describe('the stream', () => {
    it('a new Conversation: 200 event-stream with data-allowance, the answer, then data-conversation once the turn is saved, and data-outcome last; the turn is saved and counted', async () => {
      const user = await signedIn();

      const response = await send(chatBody('Who owes me money?'));
      const parts = await readParts(response);

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toMatch(/text\/event-stream/);
      expect(response.headers.get('x-vercel-ai-ui-message-stream')).toBe('v1');
      const types = parts.map((p) => p.type);
      const conversationAt = types.indexOf('data-conversation');
      const allowanceAt = types.indexOf('data-allowance');
      const outcomeAt = types.lastIndexOf('data-outcome');
      // R-02: the id is announced only after the Conversation row is saved, right before the outcome.
      expect(allowanceAt).toBe(types.findIndex((t) => t.startsWith('data-')));
      expect(allowanceAt).toBeLessThan(types.indexOf('text-delta'));
      expect(types.lastIndexOf('text-delta')).toBeLessThan(conversationAt);
      expect(conversationAt).toBe(outcomeAt - 1);
      expect(types.filter((t) => t === 'data-conversation')).toHaveLength(1);
      expect(types.indexOf('text-delta')).toBeLessThan(outcomeAt);
      expect(types.slice(outcomeAt + 1).some((t) => t.startsWith('data-'))).toBe(false);
      const conversationPart = parts[conversationAt];
      expect(conversationPart.data.title).toBe('Who owes me money?');
      expect(parts[allowanceAt].data).toMatchObject({ limit: 30, used: 1, left: 29, timeZone: TZ });
      expect(parts[outcomeAt].data).toEqual({ outcome: 'ANSWERED', counted: true });
      expect(parts.filter((p) => p.type === 'text-delta').map((p) => p.delta).join('')).toContain('Here is your answer.');

      await vi.waitFor(async () => expect(await prisma.conversation.count()).toBe(1));
      const saved = await prisma.conversation.findFirstOrThrow({ include: { messages: { orderBy: { position: 'asc' } } } });
      expect(saved.id).toBe(conversationPart.data.conversationId);
      // R-18: ids are cuids, like every other record id (data-model.md).
      expect(isCuid(saved.id)).toBe(true);
      expect(saved.userId).toBe(user.id);
      expect(saved.messages.map((m) => m.role)).toEqual(['USER', 'ASSISTANT']);
      expect(JSON.stringify(saved.messages[0].parts)).toContain('Who owes me money?');
      expect(JSON.stringify(saved.messages[1].parts)).toContain('Here is your answer.');
      const turns = await prisma.assistantTurn.findMany({ where: { userId: user.id } });
      expect(turns).toHaveLength(1);
      expect(turns[0]).toMatchObject({ outcome: 'ANSWERED', counted: true, conversationId: saved.id });
      expect(await usedToday(user.id)).toBe(1);
    });

    it('AC-09: with 18 messages used, one more leaves 11 left', async () => {
      const user = await signedIn();
      await createMessageAllowanceDay(prisma, { userId: user.id, day: localToday(), used: 18, timeZone: TZ });

      const parts = await readParts(await send(chatBody('Who owes me money?')));

      const allowance = parts.find((p) => p.type === 'data-allowance');
      expect(allowance.data).toMatchObject({ limit: 30, used: 19, left: 11 });
      expect(await usedToday(user.id)).toBe(19);
    });

    it('an existing Conversation: no data-conversation part, history is loaded server-side, the new pair is appended', async () => {
      const user = await signedIn();
      const existing = await createConversation(prisma, {
        userId: user.id,
        messages: [
          { role: 'USER', text: 'earlier question about Globex' },
          { role: 'ASSISTANT', text: 'earlier answer about Globex' },
        ],
      });

      const parts = await readParts(await send(chatBody('and what about Initech?', existing.id)));

      expect(parts.some((p) => p.type === 'data-conversation')).toBe(false);
      expect(parts.at(-1)?.type === 'finish' || parts.some((p) => p.type === 'data-outcome')).toBe(true);
      const prompt = JSON.stringify(model.doStreamCalls[0].prompt);
      expect(prompt).toContain('earlier question about Globex');
      expect(prompt).toContain('and what about Initech?');
      await vi.waitFor(async () =>
        expect(await prisma.conversationMessage.count({ where: { conversationId: existing.id } })).toBe(4)
      );
      const positions = (
        await prisma.conversationMessage.findMany({ where: { conversationId: existing.id }, orderBy: { position: 'asc' } })
      ).map((m) => m.position);
      expect(positions).toEqual([0, 1, 2, 3]);
      expect(await prisma.conversation.count()).toBe(1);
    });

    it('AC-06: an off-topic message streams the refusal as ANSWERED and counts once', async () => {
      model = scriptedModel({ verdict: { topic: 'off_topic', language: 'en', intent: 'read' }, steps: () => ({ text: 'must not run' }) });
      const { OFF_TOPIC_REFUSAL } = await import('@/lib/ai/instructions/refusal');
      const user = await signedIn();

      const parts = await readParts(await send(chatBody('Should I charge VAT to a client abroad?')));

      const text = parts.filter((p) => p.type === 'text-delta').map((p) => p.delta).join('');
      expect(text).toBe(OFF_TOPIC_REFUSAL.en);
      expect(parts.findLast((p) => p.type === 'data-outcome').data).toEqual({ outcome: 'ANSWERED', counted: true });
      expect(model.doStreamCalls).toHaveLength(0);
      expect(await usedToday(user.id)).toBe(1);
      await vi.waitFor(async () => expect(await prisma.assistantTurn.count()).toBe(1));
      const turn = await prisma.assistantTurn.findFirstOrThrow();
      expect(turn).toMatchObject({ topic: 'OFF_TOPIC', outcome: 'ANSWERED', counted: true });
    });

    it('AC-12: a proposed draft streams a persistent data-draft-card part and the card is saved with the turn', async () => {
      model = scriptedModel({
        steps: (i) =>
          i === 0
            ? {
                toolCall: {
                  name: 'propose_draft',
                  input: { customer: 'Acme', lines: [{ description: 'consulting', quantity: '20', unit: 'hours', price: '50' }] },
                },
              }
            : { text: 'Here is the draft.' },
      });
      const user = await signedIn();
      const profile = await createSenderProfile(prisma, user.id, { name: 'Main' });
      await createBankAccount(prisma, profile.id, { currency: 'USD' });
      await createCustomer(prisma, user.id, { name: 'Acme Corp' });

      const parts = await readParts(await send(chatBody('Invoice Acme 20 hours of consulting at 50')));

      const cardPart = parts.find((p) => p.type === 'data-draft-card');
      expect(cardPart).toBeDefined();
      expect(cardPart.data.cardId).toBe(cardPart.id);
      expect(isCuid(cardPart.id)).toBe(true);
      // R-14: tool calls and raw tool answers never reach the browser (openapi /api/chat 200).
      expect(parts.filter((p) => String(p.type).startsWith('tool-'))).toEqual([]);
      expect(JSON.stringify(parts)).not.toContain('"kind":"CARD"');
      await vi.waitFor(async () => expect(await prisma.draftCard.count()).toBe(1));
      const card = await prisma.draftCard.findFirstOrThrow();
      expect(card.id).toBe(cardPart.data.cardId);
      expect(card.userId).toBe(user.id);
      const assistant = await prisma.conversationMessage.findFirstOrThrow({ where: { role: 'ASSISTANT' } });
      expect(JSON.stringify(assistant.parts)).toContain(card.id);
    });
  });

  describe('failures give the slot back', () => {
    it('AC-11: a provider failure ends AI_UNAVAILABLE, releases the slot, restores data-allowance and saves only metadata', async () => {
      model = scriptedModel({ steps: () => ({ error: new Error('upstream down') }) });
      const user = await signedIn();
      await createMessageAllowanceDay(prisma, { userId: user.id, day: localToday(), used: 12, timeZone: TZ });

      const response = await send(chatBody('Who owes me money?'));
      const parts = await readParts(response);

      expect(response.status).toBe(200);
      const types = parts.map((p) => p.type);
      const allowances = parts.filter((p) => p.type === 'data-allowance');
      expect(allowances.map((a) => a.data.used)).toEqual([13, 12]);
      expect(allowances[1].data.left).toBe(18);
      const outcomeAt = types.lastIndexOf('data-outcome');
      expect(parts[outcomeAt].data).toEqual({ outcome: 'AI_UNAVAILABLE', counted: false });
      expect(types.lastIndexOf('data-allowance')).toBeGreaterThan(types.indexOf('data-outcome'));
      expect(await usedToday(user.id)).toBe(12);
      await vi.waitFor(async () => expect(await prisma.assistantTurn.count()).toBe(1));
      const turn = await prisma.assistantTurn.findFirstOrThrow();
      expect(turn).toMatchObject({ outcome: 'FAILED', counted: false, conversationId: null });
      expect(await prisma.conversation.count()).toBe(0);
      expect(await prisma.conversationMessage.count()).toBe(0);
    });

    it('AC-11: a system-side failure before the reply ends COULD_NOT_COMPLETE, releases the slot and saves only metadata', async () => {
      // A router verdict that does not parse is our side, not the provider's (a provider fault is AI_UNAVAILABLE).
      model = scriptedModel({ verdict: { topic: 'not-a-topic', language: 'en', intent: 'read' }, steps: () => ({ text: 'must not run' }) });
      const user = await signedIn();

      const parts = await readParts(await send(chatBody('Who owes me money?')));

      expect(parts.findLast((p) => p.type === 'data-outcome').data).toEqual({ outcome: 'COULD_NOT_COMPLETE', counted: false });
      expect(await usedToday(user.id)).toBe(0);
      await vi.waitFor(async () => expect(await prisma.assistantTurn.count()).toBe(1));
      expect(await prisma.assistantTurn.findFirstOrThrow()).toMatchObject({ outcome: 'FAILED', counted: false });
      expect(await prisma.conversation.count()).toBe(0);
      expect(await prisma.conversationMessage.count()).toBe(0);
    });

    it('AC-11b: the 8-step cap ends PARTIAL, counted, saved as CAPPED', async () => {
      model = scriptedModel({
        steps: (i) => ({ text: `Found part ${i + 1}. `, toolCall: { name: 'find_in_app', input: { topic: 'logo' } } }),
      });
      const user = await signedIn();

      const parts = await readParts(await send(chatBody('Tell me everything about everything')));

      expect(parts.findLast((p) => p.type === 'data-outcome').data).toEqual({ outcome: 'PARTIAL', counted: true });
      expect(await usedToday(user.id)).toBe(1);
      await vi.waitFor(async () => expect(await prisma.assistantTurn.count()).toBe(1));
      expect(await prisma.assistantTurn.findFirstOrThrow()).toMatchObject({ outcome: 'CAPPED', counted: true });
    });
  });

  describe('a Conversation deleted during its own turn (security review M-01)', () => {
    it('the streamed answer still counts: the slot is kept, one counted metadata row, no FAILED row', async () => {
      const user = await signedIn();
      const existing = await createConversation(prisma, {
        userId: user.id,
        messages: [
          { role: 'USER', text: 'earlier question' },
          { role: 'ASSISTANT', text: 'earlier answer' },
        ],
      });
      const answering = scriptedModel({ steps: () => ({ text: 'Here is your answer.' }) });
      const doStream = answering.doStream.bind(answering);
      // The Freelancer deletes the Conversation while the answer streams.
      answering.doStream = async (options) => {
        await prisma.conversation.delete({ where: { id: existing.id } });
        return doStream(options);
      };
      model = answering;

      const parts = await readParts(await send(chatBody('Who owes me money?', existing.id)));

      expect(parts.some((p) => p.type === 'text-delta')).toBe(true);
      expect(parts.findLast((p) => p.type === 'data-outcome').data).toEqual({ outcome: 'ANSWERED', counted: true });
      expect(parts.some((p) => p.type === 'data-conversation')).toBe(false);
      expect(await usedToday(user.id)).toBe(1);
      await vi.waitFor(async () => expect(await prisma.assistantTurn.count()).toBe(1));
      expect(await prisma.assistantTurn.findFirstOrThrow()).toMatchObject({ counted: true });
      expect(await prisma.conversation.count()).toBe(0);
    });
  });

  describe('a new Conversation that does not count is never announced (R-02)', () => {
    it('AC-11: AI_UNAVAILABLE on the first message sends no data-conversation; a retry without an id starts and saves the Conversation', async () => {
      let providerDown = true;
      model = scriptedModel({ steps: () => (providerDown ? { error: new Error('upstream down') } : { text: 'Back again.' }) });
      const user = await signedIn();

      const first = await readParts(await send(chatBody('Who owes me money?')));

      expect(first.findLast((p) => p.type === 'data-outcome').data).toEqual({ outcome: 'AI_UNAVAILABLE', counted: false });
      expect(first.some((p) => p.type === 'data-conversation')).toBe(false);
      expect(await prisma.conversation.count()).toBe(0);

      providerDown = false;
      const retry = await send(chatBody('Who owes me money?'));
      expect(retry.status).toBe(200);
      const parts = await readParts(retry);

      expect(parts.findLast((p) => p.type === 'data-outcome').data).toEqual({ outcome: 'ANSWERED', counted: true });
      const announced = parts.filter((p) => p.type === 'data-conversation');
      expect(announced).toHaveLength(1);
      const saved = await prisma.conversation.findFirstOrThrow();
      expect(saved.id).toBe(announced[0].data.conversationId);
      expect(saved.userId).toBe(user.id);
      expect(await usedToday(user.id)).toBe(1);
    });

    it('AC-11: a save that fails on the first message ends COULD_NOT_COMPLETE with no data-conversation and nothing saved', async () => {
      const user = await signedIn();
      vi.spyOn(appPrisma, '$transaction').mockRejectedValueOnce(new Error('db down'));
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const parts = await readParts(await send(chatBody('Who owes me money?')));

      expect(parts.findLast((p) => p.type === 'data-outcome').data).toEqual({ outcome: 'COULD_NOT_COMPLETE', counted: false });
      expect(parts.some((p) => p.type === 'data-conversation')).toBe(false);
      expect(await prisma.conversation.count()).toBe(0);
      expect(await usedToday(user.id)).toBe(0);
    });
  });

  describe('route-level acceptance (R-17)', () => {
    it('AC-06b: a mixed message shows the draft card and refuses the other part, counts once and records topic MIXED', async () => {
      model = scriptedModel({
        verdict: { topic: 'mixed', language: 'en', intent: 'draft' },
        steps: (i) =>
          i === 0
            ? {
                toolCall: {
                  name: 'propose_draft',
                  input: { customer: 'Acme', lines: [{ description: 'consulting', quantity: '20', unit: 'hours', price: '50' }] },
                },
              }
            : { text: "Here is the draft. I can't advise on VAT." },
      });
      const user = await signedIn();
      const profile = await createSenderProfile(prisma, user.id, { name: 'Main' });
      await createBankAccount(prisma, profile.id, { currency: 'USD' });
      await createCustomer(prisma, user.id, { name: 'Acme Corp' });

      const parts = await readParts(await send(chatBody('invoice Acme for 20 hours at $50 and tell me if I need to charge VAT')));

      const cardPart = parts.find((p) => p.type === 'data-draft-card');
      expect(cardPart).toBeDefined();
      expect(parts.findLast((p) => p.type === 'data-outcome').data).toEqual({ outcome: 'ANSWERED', counted: true });
      const { MIXED_INSTRUCTION } = await import('@/lib/ai/instructions/refusal');
      expect(JSON.stringify(model.doStreamCalls[0].prompt)).toContain(MIXED_INSTRUCTION);
      expect(await usedToday(user.id)).toBe(1);
      expect(await prisma.draftCard.findFirstOrThrow()).toMatchObject({ id: cardPart.data.cardId, userId: user.id });
      const turns = await prisma.assistantTurn.findMany({ where: { userId: user.id } });
      expect(turns).toHaveLength(1);
      expect(turns[0]).toMatchObject({ topic: 'MIXED', outcome: 'ANSWERED', counted: true });
    });

    it('AC-24: asked to send or issue a draft, the chat answers with a link to the draft and the draft stays a draft', async () => {
      model = scriptedModel({
        steps: (i) =>
          i === 0
            ? { toolCall: { name: 'get_invoice', input: { invoiceNumber: 'INV-0042' } } }
            : { text: 'Only you can issue an invoice. Open the draft to issue and send it.' },
      });
      const user = await signedIn();
      const profile = await createSenderProfile(prisma, user.id, { name: 'Main' });
      const account = await createBankAccount(prisma, profile.id, { currency: 'USD' });
      const customer = await createCustomer(prisma, user.id, { name: 'Acme Corp' });
      const draft = await createInvoice(prisma, {
        senderProfile: profile,
        customer,
        bankAccount: account,
        overrides: { invoiceNumber: 'INV-0042', status: 'DRAFT' },
      });

      const parts = await readParts(await send(chatBody('Send INV-0042 to the customer and mark it as issued')));

      const text = parts.filter((p) => p.type === 'text-delta').map((p) => p.delta).join('');
      expect(text).toMatch(/only you can issue/i);
      const links = parts.filter((p) => p.type === 'data-link').map((p) => p.data);
      expect(links).toContainEqual(expect.objectContaining({ kind: 'invoice', invoiceId: draft.id }));
      expect(parts.findLast((p) => p.type === 'data-outcome').data).toEqual({ outcome: 'ANSWERED', counted: true });
      const after = await prisma.invoice.findUniqueOrThrow({ where: { id: draft.id } });
      expect(after.status).toBe('DRAFT');
      expect(after.updatedAt.getTime()).toBe(draft.updatedAt.getTime());
      expect(await prisma.invoice.count()).toBe(1);
    });
  });

  describe('the used-up sentence names the real renewal time (R-15)', () => {
    it("AC-10: after a time-zone change the 429 text names renewsAt in the Freelancer's zone, not 00:00", async () => {
      const user = await signedIn();
      // The latest allowance day was opened yesterday in another zone; it renews 24 h after its first message.
      const mark = new Date(Date.now() + 2 * 60 * 60 * 1000);
      mark.setUTCMinutes(37, 0, 0);
      const yesterday = new Date(localToday().getTime() - 24 * 60 * 60 * 1000);
      await createMessageAllowanceDay(prisma, {
        userId: user.id,
        day: yesterday,
        used: 30,
        timeZone: 'America/Los_Angeles',
        firstMessageAt: new Date(mark.getTime() - 24 * 60 * 60 * 1000),
      });

      const response = await send(chatBody('one more'));
      const body = await response.json();

      expect(response.status).toBe(429);
      expect(body.details.renewsAt).toBe(mark.toISOString());
      const kyiv = (d: Date, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, ...opts }).format(d);
      const hour = kyiv(mark, { hour: '2-digit', hourCycle: 'h23' });
      const day = { year: 'numeric', month: '2-digit', day: '2-digit' } as const;
      const when = kyiv(mark, day) > kyiv(new Date(), day) ? `tomorrow at ${hour}:37` : `at ${hour}:37`;
      expect(body.error).toBe(
        `You've used today's 30 messages. They renew ${when} your time. An AI client connected with a Personal key isn't affected.`
      );
      await assertMatchesContract({ operationId: 'sendChatMessage', status: 429, body });
    });
  });

  describe('the reply streams (fix 2026-10-12, SCR-02 streaming)', () => {
    it('sends the first text-delta before the model has finished generating', async () => {
      // The model writes its first words, then holds the rest until the gate opens.
      let openGate!: () => void;
      const gate = new Promise<void>((resolve) => {
        openGate = resolve;
      });
      let calls = 0;
      model = new MockLanguageModelV4({
        doGenerate: async () =>
          ({
            content: [{ type: 'text', text: JSON.stringify({ topic: 'in_scope', language: 'en', intent: 'answer' }) }],
            finishReason: { unified: 'stop', raw: 'stop' },
            usage,
            warnings: [],
          }) as any,
        doStream: async () =>
          ({
            stream: new ReadableStream({
              async start(controller) {
                controller.enqueue({ type: 'stream-start', warnings: [] });
                if (++calls === 1) {
                  controller.enqueue({ type: 'tool-call', toolCallId: 'c1', toolName: 'find_in_app', input: JSON.stringify({ topic: 'logo' }) });
                  controller.enqueue(finish('tool-calls'));
                  controller.close();
                  return;
                }
                controller.enqueue({ type: 'text-start', id: 't1' });
                controller.enqueue({ type: 'text-delta', id: 't1', delta: 'First words.' });
                await gate;
                controller.enqueue({ type: 'text-delta', id: 't1', delta: ' The rest.' });
                controller.enqueue({ type: 'text-end', id: 't1' });
                controller.enqueue(finish('stop'));
                controller.close();
              },
            }),
          }) as any,
      });
      await signedIn();

      const response = await send(chatBody('Who owes me money?'));
      expect(response.status).toBe(200);
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let received = '';
      const firstDelta = (async () => {
        while (!received.includes('"type":"text-delta"')) {
          const { done, value } = await reader.read();
          if (done) return 'ended';
          received += decoder.decode(value, { stream: true });
        }
        return 'first words';
      })();
      const timedOut = new Promise<string>((resolve) => setTimeout(() => resolve('still waiting'), 3_000));

      const seen = await Promise.race([firstDelta, timedOut]);
      openGate();
      await firstDelta;
      while (!(await reader.read()).done);

      expect(seen).toBe('first words');
      expect(received).toContain('"delta":"First '); // the turn writes the reply out word by word
      expect(received).not.toContain('rest.');
    });
  });

  describe('the turn records its cost (R-16)', () => {
    it('writes the gateway-reported cost of the router call and the agent steps to costUsd', async () => {
      model = scriptedModel({ verdictCost: '0.000020', steps: () => ({ text: 'Here is your answer.', cost: '0.000150' }) });
      await signedIn();

      await readParts(await send(chatBody('Who owes me money?')));

      const turn = await prisma.assistantTurn.findFirstOrThrow();
      expect(turn.costUsd?.toString()).toBe('0.00017');
    });

    it('writes null when the gateway reports no cost (unknown, not free; ADR-0014)', async () => {
      await signedIn();

      await readParts(await send(chatBody('Who owes me money?')));

      const turn = await prisma.assistantTurn.findFirstOrThrow();
      expect(turn.costUsd).toBeNull();
    });
  });
});
