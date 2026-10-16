// ai-chat-v2 T127 (ai-assistant AC-14b, AC-15): the router sees a code-built marker where an assistant reply held a draft
// card or a draft question form (the stored text has neither); the agent's own history is unchanged.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from 'vitest';
import type { MockLanguageModelV4 } from 'ai/test';
import { scriptedModel } from '../../../support/ai-stub-model';

let model: MockLanguageModelV4;
vi.mock('@/lib/ai/model', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/ai/model')>()),
  getChatModel: () => model,
}));
vi.mock('@/prisma', () => ({ prisma: {} }));

const seen = vi.hoisted(() => ({ recentTurns: [] as Array<{ role: string; content: string }> }));
vi.mock('@/lib/ai/router', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/ai/router')>();
  return {
    ...actual,
    classifyMessage: async (input: { message: string; recentTurns: Array<{ role: string; content: string }> }) => {
      seen.recentTurns = input.recentTurns;
      return actual.classifyMessage(input as never);
    },
  };
});

import { runTurn } from '@/lib/ai/run-turn';

const CARD_MARKER = '[A draft card was shown in this reply.]';
const FORM_MARKER = '[A draft question form was shown in this reply.]';

const view = (role: 'user' | 'assistant', parts: unknown[], id: string) =>
  ({ id, role, origin: role === 'user' ? 'TYPED' : null, parts, createdAt: '2026-10-16T10:00:00Z' }) as never;

async function run(assistantParts: unknown[]) {
  let agentPrompt = '';
  model = scriptedModel({
    verdict: { topic: 'in_scope', language: 'en', intent: 'draft' },
    steps: (_i, prompt) => {
      agentPrompt = JSON.stringify(prompt);
      return { text: 'ok' };
    },
  });
  const turn = await runTurn({
    actor: { userId: 'u1', timeZone: 'Europe/Kyiv' } as never,
    today: '2026-10-16',
    history: [view('user', [{ type: 'text', text: 'Invoice Acme for web dev' }], 'm1'), view('assistant', assistantParts, 'm2')],
    message: 'make it 25 hours',
    signal: new AbortController().signal,
  } as never);
  for await (const _ of turn.stream) void _;
  await turn.result;
  return { router: JSON.stringify(seen.recentTurns), agentPrompt };
}

describe('runTurn gives the router a marker for a draft card or form (T127)', () => {
  it('an assistant message with a data-draft-card part: the router turns carry the card marker, text kept', async () => {
    const { router } = await run([
      { type: 'text', text: 'Here is your draft.' },
      { type: 'data-draft-card', id: 'k1', data: { cardId: 'k1' } },
    ]);
    expect(router).toContain('Here is your draft.');
    expect(router).toContain(CARD_MARKER);
    expect(router).not.toContain(FORM_MARKER);
  });

  it('an assistant message with the stored form part (data-offer): the router turns carry the form marker', async () => {
    const { router } = await run([
      { type: 'text', text: 'Which Customer?' },
      { type: 'data-offer', id: 'f1', data: { offerId: 'f1' } },
    ]);
    expect(router).toContain('Which Customer?');
    expect(router).toContain(FORM_MARKER);
    expect(router).not.toContain(CARD_MARKER);
  });

  it('a plain text reply gets no marker', async () => {
    const { router } = await run([{ type: 'text', text: 'You have 3 invoices.' }]);
    expect(router).not.toContain('[A draft');
  });

  it('the agent\'s own messages contain neither marker', async () => {
    const card = await run([{ type: 'text', text: 'Here is your draft.' }, { type: 'data-draft-card', id: 'k1', data: { cardId: 'k1' } }]);
    expect(card.agentPrompt).toContain('Here is your draft.');
    expect(card.agentPrompt).not.toContain('A draft card was shown');
    const form = await run([{ type: 'text', text: 'Which Customer?' }, { type: 'data-offer', id: 'f1', data: { offerId: 'f1' } }]);
    expect(form.agentPrompt).not.toContain('A draft question form was shown');
  });
});
