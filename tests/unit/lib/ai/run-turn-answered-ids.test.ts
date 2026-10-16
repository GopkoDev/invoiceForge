// ai-chat-v2 T123 (review W-3; AC-10, AC-14): runTurn fills the turn's answered record ids from the prior form answers,
// so propose_draft passes customerId to the resolver only when it is an option the Freelancer chose in a form answered
// in this request; otherwise the Freelancer's written `customer` goes.
import { describe, expect, it, vi } from 'vitest';
import type { MockLanguageModelV4 } from 'ai/test';
import { scriptedModel } from '../../../support/ai-stub-model';

const resolveDraftRequest = vi.hoisted(() => vi.fn());
let model: MockLanguageModelV4;

vi.mock('@/lib/ai/model', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/ai/model')>()),
  getChatModel: () => model,
}));
vi.mock('@/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/services/assistant-drafts/resolve', () => ({ resolveDraftRequest }));

import { runTurn } from '@/lib/ai/run-turn';

const actor = { userId: 'u1', timeZone: 'Europe/Kyiv' } as never;
const INPUT = { customer: 'Acme', customerId: 'c1', lines: [{ description: 'work', quantity: '1', unit: 'pcs', price: '10' }] };

async function run(priorAnswers: Array<Record<string, unknown>>) {
  resolveDraftRequest.mockReset().mockResolvedValue({ success: true, data: { kind: 'ISSUES', issues: [] } });
  model = scriptedModel({
    verdict: { topic: 'in_scope', language: 'en', intent: 'draft' },
    steps: (i) => (i === 0 ? { toolCall: { name: 'propose_draft', input: INPUT } } : { text: 'ok' }),
  });
  const turn = await runTurn({
    actor,
    today: '2026-10-16',
    history: [],
    message: 'Invoice Acme 1 work at 10',
    signal: new AbortController().signal,
    priorAnswers,
  } as never);
  for await (const _ of turn.stream) void _;
  await turn.result;
  expect(resolveDraftRequest).toHaveBeenCalledTimes(1);
  return resolveDraftRequest.mock.calls[0][1] as Record<string, unknown>;
}

describe('runTurn fills answeredRecordIds from priorAnswers (T123, W-3)', () => {
  it('priorAnswers carries customerId c1: the resolver gets customerId c1 and no customer', async () => {
    const request = await run([{ customerId: 'c1' }]);
    expect(request.customerId).toBe('c1');
    expect(request).not.toHaveProperty('customer');
  });

  it('no prior answers: the resolver gets customer Acme and no customerId', async () => {
    const request = await run([]);
    expect(request.customer).toBe('Acme');
    expect(request).not.toHaveProperty('customerId');
  });
});
