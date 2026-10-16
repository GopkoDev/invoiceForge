// fix 2026-10-12 (ai-assistant, AC-19 "a reply is never a link alone", AC-11, spec §1 D2): on "Privat" the model
// called no tool and wrote nothing, and an empty reply was saved and counted. A turn that ends with no text, no
// card and no draft issues now gets a short sentence of the system's own asking to rephrase; it is a reply the
// system produced, so it stays ANSWERED (counted). Seam: runTurn with a scripted model.
import { describe, expect, it, vi } from 'vitest';
import type { MockLanguageModelV4 } from 'ai/test';
import { scriptedModel, type StubStep } from '../../../support/ai-stub-model';

let model: MockLanguageModelV4;
vi.mock('@/lib/ai/model', () => ({ getChatModel: () => model }));
vi.mock('@/prisma', () => ({ prisma: {} })); // the tool/server import chain loads Prisma; nothing here queries it

import { runTurn } from '@/lib/ai/run-turn';

async function run(language: string, steps: (i: number) => StubStep) {
  model = scriptedModel({
    verdict: { topic: 'in_scope', language, intent: 'draft' },
    steps,
  });
  const turn = await runTurn({
    actor: { userId: 'u1', timeZone: 'Europe/Kyiv' } as never,
    today: '2026-10-12',
    history: [],
    message: 'Privat',
    signal: new AbortController().signal,
  });
  const chunks: Array<{ type: string; delta?: string }> = [];
  for await (const chunk of turn.stream)
    chunks.push(chunk as { type: string; delta?: string });
  return { chunks, result: await turn.result };
}

const streamedText = (chunks: Array<{ type: string; delta?: string }>) =>
  chunks
    .filter((c) => c.type === 'text-delta')
    .map((c) => c.delta)
    .join('');

describe('a turn the model ends with no words (fix 2026-10-12)', () => {
  it('English: no tool and no text still gets a sentence asking to rephrase, streamed and ANSWERED', async () => {
    const { chunks, result } = await run('en', () => ({}));

    expect(result.outcome).toBe('ANSWERED');
    expect(result.text).toMatch(/rephrase/i);
    expect(streamedText(chunks)).toBe(result.text);
  });

  it('Ukrainian: the sentence follows the language of the message', async () => {
    const { result } = await run('uk', () => ({}));

    expect(result.text).toMatch(/[а-яіїєґ]/i);
  });

  it('a read tool followed by no text gets the same sentence', async () => {
    const { result } = await run('en', (i) =>
      i === 0
        ? { toolCall: { name: 'find_in_app', input: { topic: 'logo' } } }
        : {}
    );

    expect(result.toolNames).toEqual(['find_in_app']);
    expect(result.text).toMatch(/rephrase/i);
  });

  it('a reply the model did write is left as it is', async () => {
    const { result } = await run('en', () => ({
      text: 'Privat is your EUR account.',
    }));

    expect(result.text).toBe('Privat is your EUR account.');
  });
});
