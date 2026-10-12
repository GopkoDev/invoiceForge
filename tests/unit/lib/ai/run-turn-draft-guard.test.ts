// T38 (ai-assistant, AC-15; sad §8 "propose_draft is offered only for the Freelancer's own message"; R-07):
// a code-level guard, not just a prompt sentence. Whatever the model calls, a turn whose Freelancer message
// carries no drafting intent never parks a draft card. Seam: runTurn with a scripted router + agent model; the
// draft resolver is stubbed to always hand back a complete proposal, so a card can only be withheld by the guard.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockLanguageModelV4 } from 'ai/test';
import { scriptedModel } from '../../../support/ai-stub-model';

let model: MockLanguageModelV4;
vi.mock('@/lib/ai/model', () => ({ getChatModel: () => model }));

vi.mock('@/prisma', () => ({ prisma: {} })); // the tool/server import chain loads Prisma; nothing here queries it

vi.mock('@/lib/services/assistant-drafts/resolve', () => ({
  resolveDraftRequest: async () => ({
    success: true,
    data: {
      kind: 'PROPOSAL',
      proposal: { customer: { name: { freelancerText: 'Acme Corp' } }, lines: [{}], total: '10.00', currency: 'USD' },
    },
  }),
}));

import { runTurn } from '@/lib/ai/run-turn';

const PROPOSE = {
  name: 'propose_draft',
  input: { customer: 'Acme Corp', lines: [{ description: 'work', quantity: '1', unit: 'pcs', price: '10' }] },
};

async function run(message: string, verdict: Record<string, unknown>) {
  model = scriptedModel({
    verdict: verdict as { topic: string; language: string },
    steps: (i) => (i === 0 ? { toolCall: PROPOSE } : { text: 'ok' }),
  });
  const turn = await runTurn({
    actor: { userId: 'u1', timeZone: 'Europe/Kyiv' } as never,
    today: '2026-10-12',
    history: [],
    message,
    signal: new AbortController().signal,
  });
  for await (const chunk of turn.stream) void chunk;
  return turn.result;
}

describe('propose_draft drafting-intent guard (AC-15)', () => {
  beforeEach(() => {
    model = scriptedModel({ steps: () => ({ text: 'ok' }) });
  });

  it('parks no card when the Freelancer message is a read question, even though the model calls propose_draft', async () => {
    const result = await run("Show me Acme Corp's details", { topic: 'in_scope', language: 'en', intent: 'read' });
    expect(result.outcome).toBe('ANSWERED');
    expect(result.toolNames).toContain('propose_draft'); // the model did try
    expect(result.pendingCard).toBeUndefined();
  });

  it('parks no card for a mixed message that carries no drafting request', async () => {
    const result = await run('Who owes me money, and should I charge VAT?', { topic: 'mixed', language: 'en', intent: 'read' });
    expect(result.pendingCard).toBeUndefined();
  });

  // N-5: the router's intent is lenient; a verdict without it answers the question and parks no card.
  it.each([
    ['missing', { topic: 'in_scope', language: 'en' }],
    ['invalid', { topic: 'in_scope', language: 'en', intent: 'create' }],
  ])('a verdict with a %s intent answers with no card and no failure', async (_label, verdict) => {
    const result = await run("Show me Acme Corp's details", verdict);
    expect(result.outcome).toBe('ANSWERED');
    expect(result.failure).toBeUndefined();
    expect(result.pendingCard).toBeUndefined();
  });

  it('positive control: the Freelancer asking to draft an invoice still gets the card', async () => {
    const result = await run('Invoice Acme Corp 1 piece of work at 10', { topic: 'in_scope', language: 'en', intent: 'draft' });
    expect(result.pendingCard?.id).toBeTruthy();
  });
});
