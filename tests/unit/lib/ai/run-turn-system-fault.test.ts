// N-9 (ai-assistant, AC-11; R-05): a non-model error in the agent phase (the agent glue, a stream error part
// that did not come from the model) is a fault on our side, SYSTEM / COULD_NOT_COMPLETE, never PROVIDER.
// Seam: runTurn with a scripted router and a stubbed chatAgent, so the fault is raised outside any model call.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { scriptedModel } from '../../../support/ai-stub-model';

const routerModel = scriptedModel({ verdict: { topic: 'in_scope', language: 'en', intent: 'read' }, steps: () => ({ text: 'ok' }) });
vi.mock('@/lib/ai/model', () => ({ getChatModel: () => routerModel }));
vi.mock('@/prisma', () => ({ prisma: {} }));

let agentStream: () => Promise<unknown>;
vi.mock('@/lib/ai/agent', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai/agent')>()),
  chatAgent: { stream: () => agentStream() },
}));

import { runTurn } from '@/lib/ai/run-turn';

async function run() {
  const turn = await runTurn({
    actor: { userId: 'u1', timeZone: 'Europe/Kyiv' } as never,
    today: '2026-10-12',
    history: [],
    message: 'How much did Acme pay me?',
    signal: new AbortController().signal,
  });
  for await (const chunk of turn.stream) void chunk;
  return turn.result;
}

const streamOf = (chunks: unknown[]) =>
  new ReadableStream({
    start(c) {
      chunks.forEach((x) => c.enqueue(x));
      c.close();
    },
  });

describe('agent-phase non-model errors (N-9)', () => {
  beforeEach(() => {
    agentStream = async () => {
      throw new Error('unset');
    };
  });

  it('a plain Error thrown while starting the agent ends FAILED with failure SYSTEM', async () => {
    agentStream = async () => {
      throw new Error('database connection lost');
    };
    const result = await run();
    expect(result.outcome).toBe('FAILED');
    expect(result.failure).toBe('SYSTEM');
  });

  it('a plain Error in a stream error part ends FAILED with failure SYSTEM', async () => {
    agentStream = async () => ({
      fullStream: streamOf([{ type: 'error', payload: { error: new Error('save glue broke') } }]),
      usage: Promise.resolve({}),
    });
    const result = await run();
    expect(result.outcome).toBe('FAILED');
    expect(result.failure).toBe('SYSTEM');
  });
});
