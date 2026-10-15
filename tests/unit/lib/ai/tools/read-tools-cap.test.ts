// ai-chat-v2 T99 (SEC-M-01 b): the chat wrapper caps every read answer; the shared registry (MCP) is untouched.
// Constants live in lib/ai/limits.ts; capToolAnswer is exported from lib/ai/tools/read-tools.ts.
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const huge = {
  invoiceId: 'inv-1',
  invoiceNumber: 'INV-1',
  notes: 'n'.repeat(50_000),
  lines: Array.from({ length: 200 }, (_, i) => ({ description: `line ${i} ` + 'd'.repeat(3000), amount: i })),
};
const fullHandlerOutput = { success: true as const, data: huge };

vi.mock('@/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/assistant-tools', () => ({
  READ_QUESTIONS: [
    {
      definition: { name: 'get_invoice', description: 'x', inputSchema: z.object({}) },
      handler: async () => fullHandlerOutput,
    },
  ],
}));

import { TOOL_ANSWER_MAX_CHARS, TOOL_ARRAY_MAX_ITEMS, TOOL_STRING_MAX_CHARS } from '@/lib/ai/limits';
import { capToolAnswer, createReadTools } from '@/lib/ai/tools/read-tools';
import { createTurnContext } from '@/lib/ai/turn-context';

describe('capToolAnswer (T99)', () => {
  it('exports the bounds', () => {
    expect([TOOL_STRING_MAX_CHARS, TOOL_ARRAY_MAX_ITEMS, TOOL_ANSWER_MAX_CHARS]).toEqual([2000, 50, 20_000]);
  });

  it('leaves a small answer unchanged', () => {
    const small = { a: 'short', rows: [{ x: 1 }, { x: 2 }], n: 3, ok: true };
    expect(capToolAnswer(small)).toEqual(small);
  });

  it('truncates a string over 2,000 chars with a marker, keeping its start', () => {
    const out = capToolAnswer({ notes: 's'.repeat(5000) }) as { notes: string };
    expect(out.notes.startsWith('s'.repeat(2000))).toBe(true);
    expect(out.notes.length).toBeGreaterThan(2000);
    expect(out.notes.length).toBeLessThan(2200);
    expect(out.notes.slice(2000)).toMatch(/\S/);
  });

  it('keeps a string of exactly 2,000 chars intact', () => {
    expect(capToolAnswer({ notes: 's'.repeat(2000) })).toEqual({ notes: 's'.repeat(2000) });
  });

  it('cuts an array over 50 items and flags truncated: true', () => {
    const out = capToolAnswer({ rows: Array.from({ length: 80 }, (_, i) => ({ i })) }) as { rows: unknown[]; truncated?: boolean };
    expect(out.rows).toHaveLength(50);
    expect(out.rows[0]).toEqual({ i: 0 });
    expect(out.truncated).toBe(true);
  });

  it('caps nested strings and arrays', () => {
    const out = capToolAnswer({ invoice: { lines: Array.from({ length: 60 }, () => ({ d: 'q'.repeat(3000) })) } }) as {
      invoice: { lines: Array<{ d: string }> };
    };
    expect(out.invoice.lines).toHaveLength(50);
    expect(out.invoice.lines[0].d.length).toBeLessThan(2200);
  });

  it('keeps the serialized answer at most 20,000 chars even when the per-field caps still leave more', () => {
    const wide = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`f${i}`, 'w'.repeat(1900)]));
    const out = capToolAnswer({ ...wide, rows: Array.from({ length: 50 }, () => ({ d: 'r'.repeat(1900) })) });
    expect(JSON.stringify(out).length).toBeLessThanOrEqual(20_000);
  });
});

describe('createReadTools caps what the model sees (T99)', () => {
  it('a huge invoice answer is capped, while its link is still extracted', async () => {
    const tools = createReadTools(createTurnContext({ actor: { userId: 'u1', timeZone: 'UTC' } as never, today: '2026-10-15' })) as unknown as Record<
      string,
      { execute: (a: unknown, c?: unknown) => Promise<Record<string, unknown>> }
    >;
    const out = await tools.get_invoice.execute({}, {});
    expect(JSON.stringify(out).length).toBeLessThanOrEqual(20_000);
    expect((out.notes as string).length).toBeLessThan(2200);
    expect(out.links).toEqual([{ kind: 'invoice', invoiceId: 'inv-1', label: 'INV-1' }]);
  });

  it('does not mutate the shared handler output (MCP answers stay whole)', async () => {
    const tools = createReadTools(createTurnContext({ actor: { userId: 'u1', timeZone: 'UTC' } as never, today: '2026-10-15' })) as unknown as Record<
      string,
      { execute: (a: unknown, c?: unknown) => Promise<Record<string, unknown>> }
    >;
    await tools.get_invoice.execute({}, {});
    expect(fullHandlerOutput.data.notes).toHaveLength(50_000);
    expect(fullHandlerOutput.data.lines).toHaveLength(200);
  });
});
