// ai-chat-v2 T63 (AC-45, spec F11, sad §5 "Chat behaviour"): every turn tells the model today's date, weekday and the
// Freelancer's time zone in a per-turn system note, so "yesterday" is never asked back. The note is not part of the
// frozen instructions (the cached prefix stays byte-identical). Seam: runTurn with a scripted model; the prompt the
// model is called with is what is asserted.
import { describe, expect, it, vi } from 'vitest';
import type { MockLanguageModelV4 } from 'ai/test';
import { scriptedModel } from '../../../support/ai-stub-model';

let model: MockLanguageModelV4;
vi.mock('@/lib/ai/model', () => ({ getChatModel: () => model }));
vi.mock('@/prisma', () => ({ prisma: {} }));

import { runTurn } from '@/lib/ai/run-turn';
import { CHAT_INSTRUCTIONS } from '@/lib/ai/instructions/chat';

async function promptOf(today: string, timeZone: string, language = 'en') {
  model = scriptedModel({
    verdict: { topic: 'in_scope', language, intent: 'draft' },
    steps: () => ({ text: 'ok' }),
  });
  const turn = await runTurn({
    actor: { userId: 'u1', timeZone } as never,
    today,
    history: [],
    message: 'create an invoice for web dev services for my new customer, 176 hours, dated yesterday',
    signal: new AbortController().signal,
  });
  for await (const _ of turn.stream) void _;
  await turn.result;
  const prompt = (model.doStreamCalls[0].prompt as Array<{ role: string; content: unknown }>) ?? [];
  const systemText = prompt
    .filter((m) => m.role === 'system')
    .map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)))
    .join('\n');
  return { prompt, systemText };
}

describe('the per-turn date note (AC-45, F11)', () => {
  it('AC-45: the model is told the weekday, the ISO date and the Freelancer time zone', async () => {
    const { systemText } = await promptOf('2026-10-13', 'Europe/Kyiv');

    expect(systemText).toContain('Today is Tuesday, 2026-10-13 in Europe/Kyiv');
  });

  it('the note follows the day and the zone of the turn, not a constant', async () => {
    const { systemText } = await promptOf('2026-01-01', 'America/New_York');

    expect(systemText).toContain('Today is Thursday, 2026-01-01 in America/New_York');
    expect(systemText).not.toContain('2026-10-13');
  });

  it('the note comes before the Freelancer message, so "yesterday" resolves against it', async () => {
    const { prompt } = await promptOf('2026-10-13', 'Europe/Kyiv');
    const at = (pred: (m: { role: string; content: unknown }) => boolean) => prompt.findIndex(pred);
    const note = at((m) => m.role === 'system' && JSON.stringify(m.content).includes('Today is Tuesday'));
    const user = at((m) => m.role === 'user');

    expect(note).toBeGreaterThanOrEqual(0);
    expect(user).toBeGreaterThan(note);
  });

  it('the frozen instructions carry no date, so the cached prefix is identical across turns', async () => {
    expect(CHAT_INSTRUCTIONS).not.toMatch(/\b20\d\d-\d\d-\d\d\b/);
    expect(CHAT_INSTRUCTIONS).not.toContain('Today is ');
    const a = await promptOf('2026-10-13', 'Europe/Kyiv');
    const b = await promptOf('2026-10-14', 'Europe/Kyiv');
    const instr = (p: typeof a.prompt) => p.find((m) => m.role === 'system' && JSON.stringify(m.content).includes('Invoice Forge'));
    expect(JSON.stringify(instr(a.prompt)?.content)).toBe(JSON.stringify(instr(b.prompt)?.content));
  });
});
