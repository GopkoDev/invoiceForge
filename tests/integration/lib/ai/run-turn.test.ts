// T29 (ai-assistant, AC-11b, AC-24): the turn runner the chat route calls. Router first, then the
// agent with a fixed tool set and an 8-step cap. The model is a scripted AI SDK mock swapped in
// through getChatModel(); the real model and network are never used.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { APICallError } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../../support/db/container';
import { createTestPrismaClient } from '../../../support/db/client';
import { truncateAllTables } from '../../../support/db/truncate';
import { createFreelancer } from '../../../support/factories/user';
import { createCustomer } from '../../../support/factories/customer';
import { createSenderProfile } from '../../../support/factories/sender-profile';
import { createBankAccount } from '../../../support/factories/bank-account';
import { actingFreelancerForTest } from '../../../support/acting-freelancer';

let model: MockLanguageModelV4;
vi.mock('@/lib/ai/model', () => ({ getChatModel: () => model }));

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

const TODAY = '2026-03-15';
const TZ = 'Europe/Kyiv';

const usage = {
  inputTokens: { total: 3, noCache: 3, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 2, text: 2, reasoning: 0 },
};
const finish = (unified: 'stop' | 'tool-calls') => ({ type: 'finish' as const, finishReason: { unified, raw: unified }, usage });

/** `cost` is the USD cost the AI Gateway reports for the call, in its provider metadata. */
type Step = { text?: string; toolCall?: { name: string; input: Record<string, unknown> }; cost?: string } | { error: Error };

const gatewayMetadata = (cost?: string) => (cost === undefined ? {} : { providerMetadata: { gateway: { cost } } });

/** One model for both stages: doGenerate answers the router, doStream plays the agent's steps in order. */
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

const toolNamesOf = (call: { tools?: Array<{ name: string }> }) => (call.tools ?? []).map((t) => t.name);

describe.runIf(containerRuntimeAvailable)('runTurn (T29)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    prisma = createTestPrismaClient(db.connectionString);
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  beforeEach(() => {
    model = scriptedModel({ steps: () => ({ text: 'ok' }) });
  });

  afterEach(async () => {
    await truncateAllTables(prisma);
  });

  async function setup() {
    const user = await createFreelancer(prisma, { email: 't29@example.com', timeZone: TZ });
    const profile = await createSenderProfile(prisma, user.id, { name: 'Main' });
    await createBankAccount(prisma, profile.id, { currency: 'USD' });
    await createCustomer(prisma, user.id, { name: 'Acme Corp' });
    const actor = await actingFreelancerForTest(user.id, TZ);
    const { runTurn } = await import('@/lib/ai/run-turn');
    const run = async (message: string, history: any[] = []) => {
      const { stream, result } = await runTurn({
        actor,
        today: TODAY,
        history,
        message,
        signal: new AbortController().signal,
      });
      const chunks: any[] = [];
      for await (const chunk of stream) chunks.push(chunk);
      return { chunks, result: await result };
    };
    return { user, run };
  }

  const historyOf = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `m${i}`,
      role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
      parts: [{ type: 'text' as const, text: `history message ${i}` }],
      createdAt: '2026-03-14T10:00:00.000Z',
    }));

  it('an in-scope question runs the agent: ANSWERED with topic, steps, toolNames, usage and UI message chunks', async () => {
    model = scriptedModel({
      steps: (i) => (i === 0 ? { toolCall: { name: 'find_in_app', input: { topic: 'logo' } } } : { text: 'Set it on the profile page.' }),
    });
    const { run } = await setup();

    const { chunks, result } = await run('Where do I set my logo?');

    expect(result.outcome).toBe('ANSWERED');
    expect(result.failure).toBeUndefined();
    expect(result.topic).toBe('IN_SCOPE');
    expect(result.steps).toBe(2);
    expect(result.toolNames).toEqual(['find_in_app']);
    expect(result.usage).toBeDefined();
    expect(result.text).toContain('Set it on the profile page.');
    expect(Array.isArray(result.links)).toBe(true);
    expect(chunks.length).toBeGreaterThan(0);
    for (const c of chunks) expect(typeof c.type).toBe('string');
    expect(chunks.some((c) => c.type === 'text-delta')).toBe(true);
  });

  it('AC-06 / ADR-0005: an off-topic message ends with the fixed refusal, no agent step, no tools, ANSWERED', async () => {
    model = scriptedModel({ verdict: { topic: 'off_topic', language: 'en', intent: 'read' }, steps: () => ({ text: 'must not run' }) });
    const { OFF_TOPIC_REFUSAL } = await import('@/lib/ai/instructions/refusal');
    const { run } = await setup();

    const { chunks, result } = await run('Should I charge VAT to a client abroad?');

    expect(result.outcome).toBe('ANSWERED');
    expect(result.topic).toBe('OFF_TOPIC');
    expect(result.text).toBe(OFF_TOPIC_REFUSAL.en);
    expect(result.toolNames).toEqual([]);
    expect(model.doStreamCalls).toHaveLength(0);
    for (const call of model.doGenerateCalls) expect(call.tools ?? []).toHaveLength(0);
    expect(chunks.some((c) => JSON.stringify(c).includes(OFF_TOPIC_REFUSAL.en))).toBe(true);
  });

  it('a mixed message passes the mixed instruction to the agent, which gets its tools', async () => {
    model = scriptedModel({ verdict: { topic: 'mixed', language: 'en', intent: 'read' }, steps: () => ({ text: 'Done the in-scope part.' }) });
    const { MIXED_INSTRUCTION } = await import('@/lib/ai/instructions/refusal');
    const { run } = await setup();

    const { result } = await run('List my overdue invoices and tell me a joke.');

    expect(result.topic).toBe('MIXED');
    expect(result.outcome).toBe('ANSWERED');
    expect(model.doStreamCalls).toHaveLength(1);
    expect(JSON.stringify(model.doStreamCalls[0].prompt)).toContain(MIXED_INSTRUCTION);
    expect(toolNamesOf(model.doStreamCalls[0] as any).length).toBeGreaterThan(0);
  });

  it('offers the read tools, find_in_app and propose_draft, in the same order on every run', async () => {
    const { run } = await setup();
    const { READ_QUESTIONS } = await import('@/lib/assistant-tools');

    await run('first');
    await run('second');

    const [a, b] = model.doStreamCalls.map((c) => toolNamesOf(c as any));
    expect(a).toEqual(b);
    expect([...a].sort()).toEqual([...READ_QUESTIONS.map((q) => q.definition.name), 'find_in_app', 'propose_draft'].sort());
  });

  it('AC-11b: endless tool calls stop at the 8th step: partial text, the too-broad sentence, CAPPED', async () => {
    model = scriptedModel({
      steps: (i) => ({ text: `Found part ${i + 1}. `, toolCall: { name: 'find_in_app', input: { topic: 'logo' } } }),
    });
    const { run } = await setup();

    const { result } = await run('Tell me everything about everything');

    expect(model.doStreamCalls).toHaveLength(8);
    expect(result.steps).toBe(8);
    expect(result.outcome).toBe('CAPPED');
    expect(result.failure).toBeUndefined();
    expect(result.text).toContain('Found part 1.');
    expect(result.text).toMatch(/too broad/i);
    expect(result.text).toMatch(/narrower/i);
    expect(result.toolNames).toHaveLength(8);
  });

  it('sends at most 40 history messages to the agent: 45 stored, the latest 40 go out', async () => {
    const { run } = await setup();

    await run('now this', historyOf(45));

    const prompt = JSON.stringify(model.doStreamCalls[0].prompt);
    const sent = (model.doStreamCalls[0].prompt as any[]).filter((m) => m.role === 'user' || m.role === 'assistant');
    // 40 history messages + the current one.
    expect(sent.length).toBeLessThanOrEqual(41);
    expect(prompt).toContain('history message 44');
    expect(prompt).toContain('history message 5');
    expect(prompt).not.toContain('history message 4"');
    expect(prompt).not.toContain('history message 0"');
    expect(prompt).toContain('now this');
  });

  it('AC-24: the agent has no tool that can issue, send, edit or delete, and its instructions carry the only-you-can-issue rule', async () => {
    const { user, run } = await setup();
    const before = await prisma.invoice.count();

    await run('Send INV-042 to the customer');

    const names = toolNamesOf(model.doStreamCalls[0] as any);
    for (const n of names) expect(n).not.toMatch(/issue|send|edit|update|delete|cancel|mark/i);
    expect(names).not.toContain('create_draft_invoice');
    const system = (model.doStreamCalls[0].prompt as any[]).filter((m) => m.role === 'system').map((m) => JSON.stringify(m.content)).join('\n');
    expect(system).toMatch(/only (the Freelancer|you) can issue/i);
    expect(system).toMatch(/link/i);
    expect(await prisma.invoice.count()).toBe(before);
    expect(user.id).toBeTruthy();
  });

  it('AC-12: a card prepared by propose_draft comes back as pendingCard, one per turn', async () => {
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
    const { run } = await setup();

    const { result } = await run('Invoice Acme 20 hours of consulting at 50');

    expect(result.outcome).toBe('ANSWERED');
    expect(result.toolNames).toEqual(['propose_draft']);
    expect((result.pendingCard as any).proposal.total).toBe('1000.00');
  });

  describe('fix 2026-10-12: an ISSUES answer the model leaves without words still says what is missing (AC-19)', () => {
    const askEur = (language: string) =>
      scriptedModel({
        verdict: { topic: 'in_scope', language, intent: 'draft' },
        steps: (i) =>
          i === 0
            ? {
                toolCall: {
                  name: 'propose_draft',
                  input: { customer: 'Acme', currency: 'EUR', lines: [{ description: 'logo', quantity: '1', price: '600' }] },
                },
              }
            : {},
      });

    it('English: the reply names the missing EUR account and the account the profile has', async () => {
      model = askEur('en');
      const { run } = await setup();

      const { chunks, result } = await run('Invoice Acme 600 EUR for the logo');

      expect(result.outcome).toBe('ANSWERED');
      expect(result.text).toContain('EUR');
      expect(result.text).toContain('USD');
      const streamed = chunks.filter((c) => c.type === 'text-delta').map((c) => c.delta).join('');
      expect(streamed).toBe(result.text);
      expect(result.links).toEqual([expect.objectContaining({ page: 'sender-profile-bank-accounts' })]);
    });

    it('Ukrainian: the fallback follows the language of the message', async () => {
      model = askEur('uk');
      const { run } = await setup();

      const { result } = await run('Створи інвойс для Acme на 600 EUR за логотип');

      expect(result.text).toMatch(/[а-яіїєґ]/i);
      expect(result.text).toContain('EUR');
    });

    it('a reply the model did write is left as it is', async () => {
      model = scriptedModel({
        steps: (i) =>
          i === 0
            ? {
                toolCall: {
                  name: 'propose_draft',
                  input: { customer: 'Acme', currency: 'EUR', lines: [{ description: 'logo', quantity: '1', price: '600' }] },
                },
              }
            : { text: 'You have no EUR account yet.' },
      });
      const { run } = await setup();

      const { result } = await run('Invoice Acme 600 EUR for the logo');

      expect(result.text).toBe('You have no EUR account yet.');
    });
  });

  it('AC-11: a provider error ends FAILED with failure PROVIDER, not counted as a answer', async () => {
    model = scriptedModel({ steps: () => ({ error: new Error('upstream down') }) });
    const { run } = await setup();

    const { result } = await run('Who owes me money?');

    expect(result.outcome).toBe('FAILED');
    expect(result.failure).toBe('PROVIDER');
  });

  it('a provider 429 ends FAILED with failure PROVIDER', async () => {
    model = scriptedModel({
      steps: () => ({
        error: new APICallError({ message: 'Too Many Requests', url: 'https://gateway', requestBodyValues: {}, statusCode: 429 }),
      }),
    });
    const { run } = await setup();

    const { result } = await run('Who owes me money?');

    expect(result.outcome).toBe('FAILED');
    expect(result.failure).toBe('PROVIDER');
  });

  // R-05: a provider fault is PROVIDER wherever it happens, the topic router included.
  it.each([
    ['a thrown error', () => new Error('upstream down')],
    ['a 429', () => new APICallError({ message: 'Too Many Requests', url: 'https://gateway', requestBodyValues: {}, statusCode: 429, isRetryable: false })],
    ['a 503', () => new APICallError({ message: 'Unavailable', url: 'https://gateway', requestBodyValues: {}, statusCode: 503, isRetryable: false })],
    ['a timeout', () => Object.assign(new Error('timed out'), { name: 'TimeoutError' })],
  ])('a provider fault at the topic router (%s) ends FAILED with failure PROVIDER and starts no agent step', async (_label, error) => {
    model = scriptedModel({ verdict: error(), steps: () => ({ text: 'must not run' }) });
    const { run } = await setup();

    const { result } = await run('Who owes me money?');

    expect(result.outcome).toBe('FAILED');
    expect(result.failure).toBe('PROVIDER');
    expect(model.doStreamCalls).toHaveLength(0);
  });

  it('a system-side router failure (a verdict that does not parse) ends FAILED with failure SYSTEM and starts no agent step', async () => {
    model = scriptedModel({ verdict: { topic: 'not-a-topic', language: 'en', intent: 'read' }, steps: () => ({ text: 'must not run' }) });
    const { run } = await setup();

    const { result } = await run('Who owes me money?');

    expect(result.outcome).toBe('FAILED');
    expect(result.failure).toBe('SYSTEM');
    expect(model.doStreamCalls).toHaveLength(0);
  });

  // R-14: tool calls and raw tool answers stay on the server; the client stream carries only text.
  it('streams only text chunks to the client, never tool inputs or tool answers', async () => {
    model = scriptedModel({
      steps: (i) => (i === 0 ? { toolCall: { name: 'list_customers', input: {} } } : { text: 'You have one Customer.' }),
    });
    const { run } = await setup();

    const { chunks, result } = await run('Who are my customers?');

    expect(result.toolNames).toEqual(['list_customers']);
    expect(new Set(chunks.map((c) => c.type))).toEqual(new Set(['text-start', 'text-delta', 'text-end']));
    expect(JSON.stringify(chunks)).not.toContain('Acme Corp');
  });

  // R-19: the chat instructions reach the model once, from the agent's own instructions.
  it('sends the chat instructions to the model exactly once', async () => {
    const { CHAT_INSTRUCTIONS } = await import('@/lib/ai/instructions/chat');
    const { run } = await setup();

    await run('Who owes me money?');

    const prompt = JSON.stringify(model.doStreamCalls[0].prompt);
    const needle = JSON.stringify(CHAT_INSTRUCTIONS.slice(0, 80)).slice(1, -1);
    expect(prompt.split(needle)).toHaveLength(2);
  });

  // R-16: the cost the AI Gateway reports, summed over the router call and every agent step.
  it('adds up the gateway-reported cost of the router call and every agent step', async () => {
    model = scriptedModel({
      verdictCost: '0.000020',
      steps: (i) =>
        i === 0 ? { toolCall: { name: 'find_in_app', input: { topic: 'logo' } }, cost: '0.000100' } : { text: 'On the profile.', cost: '0.000050' },
    });
    const { run } = await setup();

    const { result } = await run('Where do I set my logo?');

    expect(result.costUsd).toBeCloseTo(0.00017, 9);
  });

  it('a turn with no gateway-reported cost (the free-tier key) costs 0', async () => {
    const { run } = await setup();

    const { result } = await run('Who owes me money?');

    expect(result.costUsd).toBe(0);
  });
});
