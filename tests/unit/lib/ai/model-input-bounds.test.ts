// ai-chat-v2 T99 (SEC-M-01 a, b): output caps on the router and agent calls, and a character budget on the history.
// Constants and trimHistoryToBudget live in lib/ai/limits.ts.
import { describe, expect, it, vi } from 'vitest';
import type { MockLanguageModelV4 } from 'ai/test';
import { scriptedModel } from '../../../support/ai-stub-model';

let model: MockLanguageModelV4;
vi.mock('@/lib/ai/model', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/ai/model')>()),
  getChatModel: () => model,
}));
vi.mock('@/prisma', () => ({ prisma: {} }));

import { AGENT_MAX_OUTPUT_TOKENS, HISTORY_CHAR_BUDGET, ROUTER_MAX_OUTPUT_TOKENS, trimHistoryToBudget } from '@/lib/ai/limits';
import { classifyMessage } from '@/lib/ai/router';
import { runTurn } from '@/lib/ai/run-turn';
import type { ConversationMessageView } from '@/types/assistant/types';

const script = () => scriptedModel({ verdict: { topic: 'in_scope', language: 'en', intent: 'read' }, steps: () => ({ text: 'ok' }) });
const turnOf = (role: 'user' | 'assistant', content: string) => ({ role, content });
const view = (id: string, role: 'user' | 'assistant', text: string): ConversationMessageView => ({
  id,
  role,
  origin: null,
  parts: [{ type: 'text', text }],
  createdAt: '2026-10-15T10:00:00.000Z',
});

describe('output caps (T99)', () => {
  it('exports the caps', () => {
    expect(ROUTER_MAX_OUTPUT_TOKENS).toBe(300);
    expect(AGENT_MAX_OUTPUT_TOKENS).toBe(2000);
    expect(HISTORY_CHAR_BUDGET).toBe(40_000);
  });

  it('the router call is capped at 300 output tokens', async () => {
    model = script();
    await classifyMessage({ message: 'show my invoices', recentTurns: [] });
    expect(model.doGenerateCalls[0].maxOutputTokens).toBe(300);
  });

  it('every agent stream step is capped at 2000 output tokens', async () => {
    model = script();
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
    for (const call of model.doStreamCalls) expect(call.maxOutputTokens).toBe(2000);
  });
});

describe('trimHistoryToBudget (T99)', () => {
  it('keeps everything when it fits', () => {
    const h = [turnOf('user', 'a'.repeat(10)), turnOf('assistant', 'b'.repeat(10))];
    expect(trimHistoryToBudget(h, 100)).toEqual(h);
  });

  it('drops the oldest whole messages until the total is within the budget', () => {
    const h = [turnOf('user', 'a'.repeat(40)), turnOf('assistant', 'b'.repeat(40)), turnOf('user', 'c'.repeat(40)), turnOf('assistant', 'd'.repeat(40))];
    expect(trimHistoryToBudget(h, 100)).toEqual(h.slice(2));
  });

  it('keeps the newest message even when it alone exceeds the budget', () => {
    const h = [turnOf('user', 'a'.repeat(5)), turnOf('assistant', 'z'.repeat(500))];
    expect(trimHistoryToBudget(h, 100)).toEqual([h[1]]);
  });

  it('defaults to the 40,000-character budget', () => {
    const h = [turnOf('user', 'a'.repeat(30_000)), turnOf('assistant', 'b'.repeat(30_000))];
    expect(trimHistoryToBudget(h)).toEqual([h[1]]);
    const small = [turnOf('user', 'a'.repeat(20_000)), turnOf('assistant', 'b'.repeat(20_000))];
    expect(trimHistoryToBudget(small)).toEqual(small);
  });

  it('returns an empty history for an empty history', () => {
    expect(trimHistoryToBudget([], 100)).toEqual([]);
  });
});

describe('history budget reaches the model (T99)', () => {
  it('a huge old message is not in the prompt; the recent ones are', async () => {
    model = script();
    const turn = await runTurn({
      actor: { userId: 'u1', timeZone: 'Europe/Kyiv' } as never,
      today: '2026-10-13',
      history: [
        view('m1', 'user', 'HUGE_OLD_MARKER ' + 'x'.repeat(60_000)),
        view('m2', 'assistant', 'RECENT_ANSWER_MARKER'),
        view('m3', 'user', 'RECENT_QUESTION_MARKER'),
      ],
      message: 'show my invoices',
      signal: new AbortController().signal,
    });
    for await (const _ of turn.stream) void _;
    await turn.result;
    const prompt = JSON.stringify(model.doStreamCalls[0].prompt);
    expect(prompt).not.toContain('HUGE_OLD_MARKER');
    expect(prompt).toContain('RECENT_ANSWER_MARKER');
    expect(prompt).toContain('RECENT_QUESTION_MARKER');
  });
});
