// ai-chat-v2 T94 (AC-35; review 2026-10-15 round 2 N1): the router call and the agent stream are pinned to Anthropic
// at the Vercel AI Gateway, so message text never reaches the other providers that serve the same model.
import { describe, expect, it, vi } from 'vitest';
import type { MockLanguageModelV4 } from 'ai/test';
import { scriptedModel } from '../../../support/ai-stub-model';

let model: MockLanguageModelV4;
vi.mock('@/lib/ai/model', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/ai/model')>()),
  getChatModel: () => model,
}));
vi.mock('@/prisma', () => ({ prisma: {} }));

import { GATEWAY_PROVIDER_OPTIONS } from '@/lib/ai/model';
import { classifyMessage } from '@/lib/ai/router';
import { runTurn } from '@/lib/ai/run-turn';

// T101 (SEC-L-03): the request also asks the gateway not to route to providers that train on prompts.
// T109 (SEC-I-03): and to require zero data retention (a team without ZDR eligibility fails closed).
const ONLY_ANTHROPIC = { gateway: { only: ['anthropic'], disallowPromptTraining: true, zeroDataRetention: true } };

describe('gateway provider pinning (T94, AC-35)', () => {
  it('the shared option restricts the gateway to Anthropic and disallows prompt training', () => {
    expect(GATEWAY_PROVIDER_OPTIONS).toEqual(ONLY_ANTHROPIC);
  });

  it('the router model call receives providerOptions.gateway.only = [anthropic]', async () => {
    model = scriptedModel({ verdict: { topic: 'in_scope', language: 'en', intent: 'read' }, steps: () => ({ text: 'ok' }) });
    await classifyMessage({ message: 'show my invoices', recentTurns: [] });

    expect(model.doGenerateCalls).toHaveLength(1);
    expect(model.doGenerateCalls[0].providerOptions).toMatchObject(ONLY_ANTHROPIC);
  });

  it('the agent stream call receives providerOptions.gateway.only = [anthropic]', async () => {
    model = scriptedModel({ verdict: { topic: 'in_scope', language: 'en', intent: 'read' }, steps: () => ({ text: 'ok' }) });
    const turn = await runTurn({
      actor: { userId: 'u1', timeZone: 'Europe/Kyiv' } as never,
      today: '2026-10-13',
      history: [],
      message: 'show my invoices',
      signal: new AbortController().signal,
    });
    for await (const _ of turn.stream) void _;
    await turn.result;

    expect(model.doStreamCalls.length).toBeGreaterThan(0);
    expect(model.doStreamCalls[0].providerOptions).toMatchObject(ONLY_ANTHROPIC);
  });
});
