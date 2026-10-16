// fix 2026-10-12 (ai-assistant, AC-19, spec §1 "What a request may set"): the model put `currency` inside a line.
// The strict request schema refused the whole propose_draft call ("Unrecognized key(s) in object: 'currency'"
// at lines.0), and the model then made up a command syntax. A line currency that agrees with the request is
// lifted to the request; one that disagrees is refused with words that say where currency goes. Seam: runTurn
// with a scripted model; the draft resolver is stubbed and records the request it gets.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockLanguageModelV4 } from 'ai/test';
import { scriptedModel } from '../../../support/ai-stub-model';

let model: MockLanguageModelV4;
vi.mock('@/lib/ai/model', () => ({ getChatModel: () => model }));
vi.mock('@/prisma', () => ({ prisma: {} })); // the tool/server import chain loads Prisma; nothing here queries it

const resolved: unknown[] = [];
vi.mock('@/lib/services/assistant-drafts/resolve', () => ({
  resolveDraftRequest: async (_actor: unknown, request: unknown) => {
    resolved.push(request);
    return {
      success: true,
      data: {
        kind: 'PROPOSAL',
        proposal: {
          customer: { name: { freelancerText: 'Acme Corp' } },
          lines: [{}],
          total: '1660.00',
          currency: 'USD',
        },
      },
    };
  },
}));

import { runTurn } from '@/lib/ai/run-turn';

let toolAnswer = '';

async function propose(input: Record<string, unknown>) {
  model = scriptedModel({
    verdict: { topic: 'in_scope', language: 'uk', intent: 'draft' },
    steps: (i, prompt) => {
      if (i === 0) return { toolCall: { name: 'propose_draft', input } };
      toolAnswer = JSON.stringify(
        (prompt as any[]).filter((m) => m.role === 'tool')
      );
      return { text: 'ok' };
    },
  });
  const turn = await runTurn({
    actor: { userId: 'u1', timeZone: 'Europe/Kyiv' } as never,
    today: '2026-10-12',
    history: [],
    message:
      'створи інвойс для Acme із послугами програмування на суму 1660 доларів',
    signal: new AbortController().signal,
  });
  for await (const chunk of turn.stream) void chunk;
  return turn.result;
}

describe('propose_draft with a currency inside a line (fix 2026-10-12)', () => {
  beforeEach(() => {
    resolved.length = 0;
    toolAnswer = '';
  });

  it('a line currency with none on the request is lifted to the request and the card is prepared', async () => {
    const result = await propose({
      customer: 'Acme',
      lines: [{ description: 'programming', price: '1660', currency: 'USD' }],
    });

    expect(resolved).toEqual([
      {
        customer: 'Acme',
        currency: 'USD',
        lines: [{ description: 'programming', price: '1660' }],
      },
    ]);
    expect(result.pendingCard).toBeDefined();
  });

  it('a line currency that repeats the request currency is dropped', async () => {
    await propose({
      customer: 'Acme',
      currency: 'usd',
      lines: [{ description: 'programming', price: '1660', currency: 'USD' }],
    });

    expect(resolved).toEqual([
      {
        customer: 'Acme',
        currency: 'usd',
        lines: [{ description: 'programming', price: '1660' }],
      },
    ]);
  });

  it('a line currency that disagrees is refused with words saying currency goes on the request', async () => {
    const result = await propose({
      customer: 'Acme',
      currency: 'EUR',
      lines: [{ description: 'programming', price: '1660', currency: 'USD' }],
    });

    expect(resolved).toEqual([]);
    expect(result.pendingCard).toBeUndefined();
    expect(toolAnswer).toMatch(/currency once for the whole request/);
  });

  it('the tool the model is offered still describes the request fields', async () => {
    await propose({
      customer: 'Acme',
      lines: [{ description: 'programming', price: '1660', currency: 'USD' }],
    });

    const tool = ((model.doStreamCalls[0] as any).tools as any[]).find(
      (t) => t.name === 'propose_draft'
    );
    expect(Object.keys(tool.inputSchema.properties)).toEqual(
      expect.arrayContaining(['customer', 'currency', 'lines'])
    );
  });
});
