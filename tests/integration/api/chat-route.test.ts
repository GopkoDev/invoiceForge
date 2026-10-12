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
import { assertMatchesContract } from '../../support/contract/validate';

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

type Step = { text?: string; toolCall?: { name: string; input: Record<string, unknown> } } | { error: Error };

function scriptedModel(opts: { verdict?: { topic: string; language: string } | Error; steps: (i: number) => Step }) {
  let streamCall = 0;
  return new MockLanguageModelV4({
    doGenerate: async () => {
      if (opts.verdict instanceof Error) throw opts.verdict;
      return {
        content: [{ type: 'text', text: JSON.stringify(opts.verdict ?? { topic: 'in_scope', language: 'en' }) }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage,
        warnings: [],
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
      chunks.push(finish(step.toolCall ? 'tool-calls' : 'stop'));
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
    it('a new Conversation: 200 event-stream with data-conversation first, then data-allowance, the answer and data-outcome last; the turn is saved and counted', async () => {
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
      expect(conversationAt).toBe(types.findIndex((t) => t.startsWith('data-')));
      expect(conversationAt).toBeLessThan(allowanceAt);
      expect(allowanceAt).toBeLessThan(types.indexOf('text-delta'));
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
      model = scriptedModel({ verdict: { topic: 'off_topic', language: 'en' }, steps: () => ({ text: 'must not run' }) });
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
      model = scriptedModel({ verdict: new Error('router blew up'), steps: () => ({ text: 'must not run' }) });
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
});
