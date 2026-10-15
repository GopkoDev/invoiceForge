// ai-chat-v2 T103 (SEC-M-02, SEC-L-04): one turn's tool answers share a byte budget and a call cap; truncation is
// byte-bounded and never splits a surrogate pair; link labels are capped.
//
// Contract for the implementer:
//  - lib/ai/limits.ts exports HISTORY_BYTES_BUDGET=40_000, TOOL_ANSWER_MAX_BYTES=20_000, TURN_TOOL_BUDGET_BYTES=60_000,
//    TURN_TOOL_CALLS_MAX=12, LINK_LABEL_MAX_CHARS=80, TOOL_BUDGET_USED_UP_TEXT (the fixed sentence), the type
//    ToolBudget = { bytesLeft: number; callsLeft: number } and
//    spendToolBudget(budget, answer) => answer | { message: TOOL_BUDGET_USED_UP_TEXT }:
//    callsLeft is decremented on every call; when callsLeft was 0, or UTF-8 JSON bytes of the answer exceed bytesLeft,
//    the fixed answer is returned (its own bytes are not charged); otherwise bytesLeft -= bytes and the answer is returned.
//  - TurnContext.toolBudget: ToolBudget, starting at { bytesLeft: 60_000, callsLeft: 12 } (createTurnContext).
//  - Every chat tool (read tools, find_in_app, propose_draft incl. the pinned answer, ask_user) spends it. Once spent
//    the tool does not run its read. run-turn charges the pinned propose_draft step and the prior ask_user step
//    (priorAnswers) against it before the model runs.
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { MockLanguageModelV4 } from 'ai/test';
import { scriptedModel } from '../../../support/ai-stub-model';

let model: MockLanguageModelV4;
let handlerCalls = 0;
vi.mock('@/lib/ai/model', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/ai/model')>()),
  getChatModel: () => model,
}));
vi.mock('@/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/assistant-tools', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/assistant-tools')>()),
  READ_QUESTIONS: [
    {
      definition: { name: 'get_invoice', description: 'x', inputSchema: z.object({ big: z.boolean().optional(), number: z.string().optional() }) },
      handler: async (args: { big?: boolean; number?: string }) => {
        handlerCalls += 1;
        const body = args.big ? Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`f${i}`, 'x'.repeat(1990)])) : {};
        return { success: true as const, data: { invoiceId: 'inv-1', invoiceNumber: args.number ?? 'INV-1', ...body } };
      },
    },
  ],
}));

import {
  LINK_LABEL_MAX_CHARS,
  TOOL_ANSWER_MAX_BYTES,
  TOOL_BUDGET_USED_UP_TEXT,
  TURN_TOOL_BUDGET_BYTES,
  TURN_TOOL_CALLS_MAX,
  spendToolBudget,
} from '@/lib/ai/limits';
import { createChatTools } from '@/lib/ai/agent';
import { capToolAnswer } from '@/lib/ai/tools/read-tools';
import { createTurnContext } from '@/lib/ai/turn-context';
import { runTurn } from '@/lib/ai/run-turn';

const FIXED = 'The tool budget for this message is used up; answer from what you already have.';
const bytes = (x: unknown) => Buffer.byteLength(JSON.stringify(x), 'utf8');
const actor = { userId: 'u1', timeZone: 'Europe/Kyiv' } as never;

type Exec = { execute: (a: unknown, c?: unknown) => Promise<Record<string, unknown>> };
const toolsOf = (turn: ReturnType<typeof createTurnContext>) => createChatTools(turn) as unknown as Record<string, Exec>;

function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => strings(v, out));
  else if (value && typeof value === 'object') Object.entries(value).forEach(([k, v]) => (out.push(k), strings(v, out)));
  return out;
}
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

async function run(steps: Parameters<typeof scriptedModel>[0]['steps'], extra: Record<string, unknown> = {}) {
  handlerCalls = 0;
  model = scriptedModel({ verdict: { topic: 'in_scope', language: 'en', intent: 'read' }, steps });
  const turn = await runTurn({ actor, today: '2026-10-15', history: [], message: 'show invoices', signal: new AbortController().signal, ...extra });
  for await (const _ of turn.stream) void _;
  return turn.result;
}

/** The tool-result parts of the prompt the model got on stream call `n`. */
function toolResults(n: number): Array<{ toolName: string; output: unknown }> {
  const prompt = model.doStreamCalls[n].prompt as Array<{ role: string; content: unknown }>;
  return prompt.filter((m) => m.role === 'tool').flatMap((m) => m.content as Array<{ toolName: string; output: unknown }>);
}
const occurrences = (hay: string, needle: string) => hay.split(needle).length - 1;

describe('limits (T103)', () => {
  it('exports the byte bounds', () => {
    expect([TOOL_ANSWER_MAX_BYTES, TURN_TOOL_BUDGET_BYTES, TURN_TOOL_CALLS_MAX, LINK_LABEL_MAX_CHARS]).toEqual([20_000, 60_000, 12, 80]);
    expect(TOOL_BUDGET_USED_UP_TEXT).toBe(FIXED);
  });

  it('a new turn starts with the full budget', () => {
    expect(createTurnContext({ actor, today: '2026-10-15' }).toolBudget).toEqual({ bytesLeft: 60_000, callsLeft: 12 });
  });

  it('spendToolBudget charges bytes and a call, and refuses what does not fit', () => {
    const budget = { bytesLeft: 100, callsLeft: 2 };
    const small = { a: 'x'.repeat(20) };
    expect(spendToolBudget(budget, small)).toEqual(small);
    expect(budget).toEqual({ bytesLeft: 100 - bytes(small), callsLeft: 1 });
    expect(JSON.stringify(spendToolBudget(budget, { a: 'y'.repeat(500) }))).toContain(FIXED);
    expect(budget.callsLeft).toBe(0);
    expect(JSON.stringify(spendToolBudget(budget, {}))).toContain(FIXED);
  });
});

describe('capToolAnswer is byte-bounded with a hard final check (T103, SEC-L-04)', () => {
  const shapes: Record<string, Record<string, unknown>> = {
    'many short keys': Object.fromEntries(Array.from({ length: 6000 }, (_, i) => [`key${i}`, i])),
    'deep nesting with long strings': (() => {
      let node: Record<string, unknown> = { leaf: 'z'.repeat(1999) };
      for (let i = 0; i < 300; i++) node = { s: 'q'.repeat(1999), child: node };
      return node;
    })(),
    'many 1,999-char strings': { rows: Array.from({ length: 50 }, () => ({ a: 'r'.repeat(1999), b: 'r'.repeat(1999), c: ['s'.repeat(1999), 't'.repeat(1999)] })) },
    'Cyrillic strings (2 bytes a char)': Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`f${i}`, 'я'.repeat(1999)])),
    'emoji strings (4 bytes a char)': Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`f${i}`, '😀'.repeat(990)])),
  };
  for (const [name, shape] of Object.entries(shapes)) {
    it(`${name}: at most 20,000 UTF-8 bytes of JSON, no split character`, () => {
      const out = capToolAnswer(shape);
      expect(bytes(out)).toBeLessThanOrEqual(20_000);
      for (const s of strings(out)) expect(LONE_SURROGATE.test(s)).toBe(false);
    });
  }

  it('a Cyrillic answer under 20,000 chars but over 20,000 bytes is cut', () => {
    const out = capToolAnswer(Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`f${i}`, 'я'.repeat(1900)]))); // 15.2k chars, 30k+ bytes
    expect(bytes(out)).toBeLessThanOrEqual(20_000);
  });
});

describe('truncation never splits a surrogate pair (T103, SEC-L-04)', () => {
  it('1,999 chars then an emoji: the cut yields valid UTF-16', () => {
    const out = capToolAnswer({ s: 'a'.repeat(1999) + '😀' + 'tail' }) as { s: string };
    expect(out.s.startsWith('a'.repeat(1999))).toBe(true);
    expect(out.s).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
    expect(out.s.isWellFormed()).toBe(true);
    expect(out.s).toContain('[truncated]');
  });

  it('an emoji-only long string stays well-formed', () => {
    const out = capToolAnswer({ s: '😀'.repeat(2500) }) as { s: string };
    expect(out.s.isWellFormed()).toBe(true);
  });
});

describe('link labels are capped (T103)', () => {
  it('an invoice number of 300 chars becomes a label of at most 80 chars', async () => {
    const turn = createTurnContext({ actor, today: '2026-10-15' });
    const out = await toolsOf(turn).get_invoice.execute({ number: 'N'.repeat(300) }, {});
    const labels = (out.links as Array<{ label: string }>).map((l) => l.label);
    expect(labels).toHaveLength(1);
    expect(labels[0].length).toBeLessThanOrEqual(80);
    expect(labels[0].startsWith('N'.repeat(70))).toBe(true);
  });
});

describe('the per-turn tool budget in tools (T103, SEC-M-02)', () => {
  it('a propose_draft answer counts against the same budget', async () => {
    const turn = createTurnContext({ actor, today: '2026-10-15' });
    turn.pinnedAnswer = { kind: 'CARD', cardId: 'c1', pad: 'p'.repeat(19_000) };
    const tools = toolsOf(turn);
    for (let i = 0; i < 3; i++) expect(await tools.propose_draft.execute({ customer: 'Acme', lines: [{ description: 'Work' }] }, {})).toMatchObject({ kind: 'CARD' });
    expect(turn.toolBudget.bytesLeft).toBeLessThan(60_000 - 3 * 19_000);
    expect(JSON.stringify(await tools.get_invoice.execute({ big: true }, {}))).toContain(FIXED);
  });

  it('find_in_app answers the fixed text once the call cap is spent, and a spent read does not run', async () => {
    const turn = createTurnContext({ actor, today: '2026-10-15' });
    turn.toolBudget.callsLeft = 0;
    handlerCalls = 0;
    const tools = toolsOf(turn);
    expect(JSON.stringify(await tools.find_in_app.execute({ topic: 'logo' }, {}))).toContain(FIXED);
    expect(JSON.stringify(await tools.get_invoice.execute({}, {}))).toContain(FIXED);
    expect(handlerCalls).toBe(0);
  });

  it('ask_user answers the fixed text once the budget is spent and parks no questions', async () => {
    const turn = createTurnContext({ actor, today: '2026-10-15' });
    turn.toolBudget.callsLeft = 0;
    const out = await toolsOf(turn).ask_user.execute({ questions: [{ field: 'dueDate', prompt: 'When is it due?' }] }, {});
    expect(JSON.stringify(out)).toContain(FIXED);
    expect(turn.pending.ask).toBeNull();
  });
});

describe('the per-turn tool budget in a turn (T103, SEC-M-02)', () => {
  const calls = (n: number, input: Record<string, unknown>) => ({ toolCalls: Array.from({ length: n }, () => ({ name: 'get_invoice', input })) });

  it('15 parallel ~19k-byte get_invoice calls: the model gets at most 60,000 bytes of tool results and the rest get the fixed text', async () => {
    await run((i) => (i === 0 ? calls(15, { big: true }) : { text: 'done' }));
    const results = toolResults(1);
    expect(results).toHaveLength(15);
    const total = results.reduce((sum, r) => sum + bytes((r.output as { value?: unknown }).value ?? r.output), 0);
    expect(total).toBeLessThanOrEqual(60_000);
    expect(occurrences(JSON.stringify(results), FIXED)).toBeGreaterThanOrEqual(11);
  });

  it('the 13th call gets the fixed text and its read does not run', async () => {
    await run((i) => (i === 0 ? calls(14, {}) : { text: 'done' }));
    const results = toolResults(1);
    expect(results).toHaveLength(14);
    expect(handlerCalls).toBe(12);
    expect(occurrences(JSON.stringify(results), FIXED)).toBe(2);
  });

  it('prior steps count: a sent form answer of ~55k bytes leaves no room for a 19k read', async () => {
    const answers = Array.from({ length: 5 }, (_, i) => ({ question: `q${i}`, answer: 'x'.repeat(11_000) }));
    await run((i) => (i === 0 ? calls(1, { big: true }) : { text: 'done' }), { priorAnswers: answers });
    const read = toolResults(1).find((r) => r.toolName === 'get_invoice');
    expect(JSON.stringify(read)).toContain(FIXED);
  });
});
