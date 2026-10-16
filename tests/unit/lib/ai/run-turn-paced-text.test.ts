// fix 2026-10-12 (ai-assistant, SCR-02 "streaming": text deltas render progressively; spec §6 first words): the
// model then in use (Gemini Flash-Lite through the AI Gateway) wrote a short reply in one burst of ~0.2 s at the end of a
// multi-second turn, so the whole reply landed in the chat at once. The turn now writes the model's text out
// word by word, a few milliseconds apart. Seam: runTurn with a scripted model.
import { describe, expect, it, vi } from 'vitest';
import type { MockLanguageModelV4 } from 'ai/test';
import { scriptedModel } from '../../../support/ai-stub-model';

let model: MockLanguageModelV4;
vi.mock('@/lib/ai/model', () => ({ getChatModel: () => model }));
vi.mock('@/prisma', () => ({ prisma: {} })); // the tool/server import chain loads Prisma; nothing here queries it

import { runTurn, WORD_DELAY_MS } from '@/lib/ai/run-turn';

const REPLY = 'Acme Corp owes you 1,000.00 USD,\ndue since March 3.';

describe("the model's reply is written out word by word (fix 2026-10-12)", () => {
  it('a reply the model sends in one burst reaches the chat as paced word deltas', async () => {
    model = scriptedModel({
      verdict: { topic: 'in_scope', language: 'en', intent: 'read' },
      steps: () => ({ text: REPLY }),
    });
    const turn = await runTurn({
      actor: { userId: 'u1', timeZone: 'Europe/Kyiv' } as never,
      today: '2026-10-12',
      history: [],
      message: 'Who owes me money?',
      signal: new AbortController().signal,
    });

    const deltas: Array<{ delta: string; at: number }> = [];
    for await (const chunk of turn.stream) {
      const c = chunk as { type: string; delta?: string };
      if (c.type === 'text-delta')
        deltas.push({ delta: c.delta ?? '', at: performance.now() });
    }
    const result = await turn.result;

    expect(deltas.map((d) => d.delta)).toEqual([
      'Acme ',
      'Corp ',
      'owes ',
      'you ',
      '1,000.00 ',
      'USD,\n',
      'due ',
      'since ',
      'March ',
      '3.',
    ]);
    expect(deltas[deltas.length - 1].at - deltas[0].at).toBeGreaterThanOrEqual(
      (deltas.length - 1) * WORD_DELAY_MS - 5
    );
    expect(result.text).toBe(REPLY);
  });
});
