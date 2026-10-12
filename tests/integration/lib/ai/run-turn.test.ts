// T29 (ai-assistant, AC-11b, AC-24): the turn runner the chat route calls. Router first, then the
// agent with a fixed tool set and an 8-step cap. The model is a scripted AI SDK mock swapped in
// through getChatModel(); the real model and network are never used.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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

type Step = { text?: string; toolCall?: { name: string; input: Record<string, unknown> } } | { error: Error };

/** One model for both stages: doGenerate answers the router, doStream plays the agent's steps in order. */
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
    model = scriptedModel({ verdict: { topic: 'off_topic', language: 'en' }, steps: () => ({ text: 'must not run' }) });
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
    model = scriptedModel({ verdict: { topic: 'mixed', language: 'en' }, steps: () => ({ text: 'Done the in-scope part.' }) });
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

  it('AC-11: a provider error ends FAILED with failure PROVIDER, not counted as a answer', async () => {
    model = scriptedModel({ steps: () => ({ error: new Error('upstream down') }) });
    const { run } = await setup();

    const { result } = await run('Who owes me money?');

    expect(result.outcome).toBe('FAILED');
    expect(result.failure).toBe('PROVIDER');
  });

  it('a provider 429 ends FAILED with failure PROVIDER', async () => {
    const { APICallError } = await import('ai');
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

  it('a router failure ends FAILED with failure SYSTEM and starts no agent step', async () => {
    model = scriptedModel({ verdict: new Error('router blew up'), steps: () => ({ text: 'must not run' }) });
    const { run } = await setup();

    const { result } = await run('Who owes me money?');

    expect(result.outcome).toBe('FAILED');
    expect(result.failure).toBe('SYSTEM');
    expect(model.doStreamCalls).toHaveLength(0);
  });
});
