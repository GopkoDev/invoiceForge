// ai-chat-v2 T106 (final review N-1, N-2): a card or form is kept only when its answer fits the turn budget; draft
// answers and links are inside the byte cap.
//
// Contract for the implementer:
//  - Tool bodies that set turn.pending (propose_draft, ask_user) no longer set it while building the answer. The body
//    returns `{ answer, commit }`, and `withToolBudget(budget, run)` (lib/ai/limits.ts) calls `commit()` only after the
//    answer was charged successfully (a refused answer - budget text - never commits). Bodies with nothing to commit
//    may return `{ answer }`. So a refused answer leaves turn.pending.card/.resolver/.ask, runTurn's pendingCard /
//    pendingForm and `drafted` unchanged.
//  - propose_draft answers (CARD, ISSUES, ...) pass through capToolAnswer (<= 20,000 UTF-8 JSON bytes).
//  - read-tool links are inside capToolAnswer's final byte check: the whole read answer incl. `links` is <= 20,000 bytes.
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { MockLanguageModelV4 } from 'ai/test';
import { scriptedModel } from '../../../support/ai-stub-model';

const state = vi.hoisted(() => ({ resolved: 'PROPOSAL' as 'PROPOSAL' | 'ISSUES' }));
let model: MockLanguageModelV4;

vi.mock('@/lib/ai/model', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/ai/model')>()),
  getChatModel: () => model,
}));
vi.mock('@/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/services/assistant-drafts/resolve', () => ({
  resolveDraftRequest: async () => ({
    success: true,
    data:
      state.resolved === 'ISSUES'
        ? {
            kind: 'ISSUES',
            issues: Array.from({ length: 50 }, (_, i) => ({ kind: 'FIELD_INVALID', field: `taxRate${i}`, message: 'm'.repeat(1999) })),
          }
        : {
            kind: 'PROPOSAL',
            proposal: { customer: { name: { freelancerText: 'Acme Corp' } }, lines: [{}], total: '10.00', currency: 'USD' },
          },
  }),
}));
vi.mock('@/lib/services/assistant-drafts/forms', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/services/assistant-drafts/forms')>()),
  checkAskUser: async () => ({
    ok: true,
    questions: [{ field: 'FREE', lineIndex: null, prompt: 'When is it due?', options: [], matchCount: null, optional: false }],
    draft: null,
  }),
}));
vi.mock('@/lib/assistant-tools', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/assistant-tools')>()),
  READ_QUESTIONS: [
    {
      definition: { name: 'list_invoices', description: 'x', inputSchema: z.object({}) },
      handler: async () => ({
        success: true as const,
        data: {
          rows: Array.from({ length: 50 }, (_, i) => ({ invoiceId: `${'i'.repeat(100)}${i}`, invoiceNumber: `${'N'.repeat(80)}${i}` })),
        },
      }),
    },
  ],
}));

import { TOOL_BUDGET_USED_UP_TEXT } from '@/lib/ai/limits';
import { createChatTools } from '@/lib/ai/agent';
import { capToolAnswer } from '@/lib/ai/tools/read-tools';
import { createTurnContext } from '@/lib/ai/turn-context';
import { runTurn } from '@/lib/ai/run-turn';

const bytes = (x: unknown) => Buffer.byteLength(JSON.stringify(x), 'utf8');
const actor = { userId: 'u1', timeZone: 'Europe/Kyiv' } as never;
type Exec = { execute: (a: unknown, c?: unknown) => Promise<Record<string, unknown>> };
const toolsOf = (turn: ReturnType<typeof createTurnContext>) => createChatTools(turn) as unknown as Record<string, Exec>;
const REQUEST = { customer: 'Acme Corp', lines: [{ description: 'work', quantity: '1', unit: 'pcs', price: '10' }] };
const ASK = { questions: [{ field: 'FREE', prompt: 'When is it due?' }] };
const fresh = () => createTurnContext({ actor, today: '2026-10-15', draftIntent: true });

describe('a refused answer commits nothing (T106, N-1)', () => {
  it('propose_draft CARD that does not fit: budget text, no pending card or resolver', async () => {
    state.resolved = 'PROPOSAL';
    const turn = fresh();
    turn.toolBudget.bytesLeft = 100;
    const out = await toolsOf(turn).propose_draft.execute(REQUEST, {});
    expect(JSON.stringify(out)).toContain(TOOL_BUDGET_USED_UP_TEXT);
    expect(out.kind).toBeUndefined();
    expect(turn.pending.card).toBeNull();
    expect(turn.pending.resolver).toBeNull();
  });

  it('propose_draft ISSUES that does not fit: budget text, no resolver questions parked', async () => {
    state.resolved = 'ISSUES';
    const turn = fresh();
    turn.toolBudget.bytesLeft = 100;
    const out = await toolsOf(turn).propose_draft.execute(REQUEST, {});
    state.resolved = 'PROPOSAL';
    expect(JSON.stringify(out)).toContain(TOOL_BUDGET_USED_UP_TEXT);
    expect(turn.pending.resolver).toBeNull();
  });

  it('ask_user that does not fit: budget text, no parked questions', async () => {
    const turn = fresh();
    turn.toolBudget.bytesLeft = 10;
    const out = await toolsOf(turn).ask_user.execute(ASK, {});
    expect(JSON.stringify(out)).toContain(TOOL_BUDGET_USED_UP_TEXT);
    expect(turn.pending.ask).toBeNull();
    expect(turn.pending.askRefused).toBeNull();
  });

  it('control: with ample budget a CARD still sets the pending card, and ask_user its questions', async () => {
    state.resolved = 'PROPOSAL';
    const turn = fresh();
    const out = await toolsOf(turn).propose_draft.execute(REQUEST, {});
    expect(out).toMatchObject({ kind: 'CARD' });
    expect(turn.pending.card?.id).toBe(out.cardId);
    await toolsOf(turn).ask_user.execute(ASK, {});
    expect(turn.pending.ask?.questions).toHaveLength(1);
  });
});

describe('a refused card or form is not shown (T106, N-1, runTurn)', () => {
  // Five prior form answers (over 60k bytes) leave the turn budget spent (bytes clamp at 0) before the model runs.
  const answers = Array.from({ length: 5 }, (_, i) => ({ question: `q${i}`, answer: 'x'.repeat(12_100) }));
  async function run(call: { name: string; input: unknown }) {
    model = scriptedModel({
      verdict: { topic: 'in_scope', language: 'en', intent: 'draft' },
      steps: (i) => (i === 0 ? { toolCall: call } : { text: 'ok' }),
    });
    const turn = await runTurn({ actor, today: '2026-10-15', history: [], message: 'Invoice Acme 1 work at 10', signal: new AbortController().signal, priorAnswers: answers });
    for await (const _ of turn.stream) void _;
    return { result: await turn.result, results: (model.doStreamCalls[1].prompt as Array<{ role: string; content: unknown }>).filter((m) => m.role === 'tool') };
  }

  it('propose_draft: the model got the budget text, no card is emitted', async () => {
    state.resolved = 'PROPOSAL';
    const { result, results } = await run({ name: 'propose_draft', input: REQUEST });
    const sent = JSON.stringify(results);
    expect(sent).toContain(TOOL_BUDGET_USED_UP_TEXT);
    expect(sent).not.toContain('"CARD"');
    expect(result.pendingCard).toBeUndefined();
    expect(result.pendingForm).toBeUndefined();
  });

  it('ask_user: the model got the budget text, no form is emitted', async () => {
    const { result, results } = await run({ name: 'ask_user', input: { questions: [{ field: 'FREE', prompt: 'When is it due?' }] } });
    expect(JSON.stringify(results)).toContain(TOOL_BUDGET_USED_UP_TEXT);
    expect(result.pendingForm).toBeUndefined();
  });
});

describe('draft answers and links stay inside the byte cap (T106, N-2)', () => {
  it('a propose_draft ISSUES answer of 50 long issues is at most 20,000 bytes', async () => {
    state.resolved = 'ISSUES';
    const out = await toolsOf(fresh()).propose_draft.execute(REQUEST, {});
    state.resolved = 'PROPOSAL';
    expect(out.kind).toBe('ISSUES'); // answered, not refused by the budget
    expect(bytes(out)).toBeLessThanOrEqual(20_000);
  });

  it('a read answer whose links would push it past the cap stays at most 20,000 bytes with its links', async () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({ invoiceId: `${'i'.repeat(100)}${i}`, invoiceNumber: `${'N'.repeat(80)}${i}` }));
    expect(bytes(capToolAnswer({ rows }))).toBeLessThanOrEqual(20_000); // precondition: the rows alone fit
    const out = await toolsOf(fresh()).list_invoices.execute({}, {});
    expect(out.links).toBeDefined();
    expect(bytes(out)).toBeLessThanOrEqual(20_000);
  });
});
