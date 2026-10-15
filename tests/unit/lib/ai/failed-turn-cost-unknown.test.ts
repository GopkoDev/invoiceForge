// ai-chat-v2 T95 (review 2026-10-15 round 2 N3): a router call that throws leaves its cost unknown (null), never
// free (0); the router verdict always carries its cost key.
import { describe, expect, it, vi } from 'vitest';
import type { MockLanguageModelV4 } from 'ai/test';
import { scriptedModel } from '../../../support/ai-stub-model';

let model: MockLanguageModelV4;
vi.mock('@/lib/ai/model', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/ai/model')>()),
  getChatModel: () => model,
}));
vi.mock('@/prisma', () => ({ prisma: {} }));

import { classifyMessage } from '@/lib/ai/router';
import { runTurn } from '@/lib/ai/run-turn';

const input = {
  actor: { userId: 'u1', timeZone: 'Europe/Kyiv' } as never,
  today: '2026-10-13',
  history: [],
  message: 'show my invoices',
  signal: new AbortController().signal,
};

describe('failed turn cost is unknown (T95)', () => {
  it.each([
    ['a provider error', new Error('upstream down')],
    ['a generic error', new TypeError('boom')],
  ])('a router call that throws (%s) yields costUsd null, not 0', async (_n, error) => {
    model = scriptedModel({ verdict: error, steps: () => ({ text: 'ok' }) });
    const turn = await runTurn(input);
    const result = await turn.result;

    expect(result.outcome).toBe('FAILED');
    expect(result.costUsd).toBeNull();
  });

  it('the router verdict always has its own costUsd key (number or null)', async () => {
    model = scriptedModel({ verdict: { topic: 'in_scope', language: 'en', intent: 'read' }, steps: () => ({ text: 'ok' }) });
    const verdict = await classifyMessage({ message: 'show my invoices', recentTurns: [] });

    expect(Object.prototype.hasOwnProperty.call(verdict, 'costUsd')).toBe(true);
    expect(verdict.costUsd === null || typeof verdict.costUsd === 'number').toBe(true);
  });
});
