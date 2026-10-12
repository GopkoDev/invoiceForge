// fix 2026-10-12 (ai-assistant, AC-07, AC-35): the pages find_in_app found become links on the reply. The
// bank-accounts page needs a sender profile id find_in_app never has, so it must not be stored id-less: a
// stored link like that crashed the Conversation page on reopening. Seam: runTurn with a scripted model.
import { describe, expect, it, vi } from 'vitest';
import type { MockLanguageModelV4 } from 'ai/test';
import { scriptedModel } from '../../../support/ai-stub-model';
import { appLinkSchema } from '@/lib/validations/assistant-chat';
import { appPageRoute } from '@/lib/ai/app-map';

let model: MockLanguageModelV4;
vi.mock('@/lib/ai/model', () => ({ getChatModel: () => model }));
vi.mock('@/prisma', () => ({ prisma: {} })); // the tool/server import chain loads Prisma; nothing here queries it

import { runTurn } from '@/lib/ai/run-turn';

async function run(topic: string) {
  model = scriptedModel({
    steps: (i) =>
      i === 0
        ? { toolCall: { name: 'find_in_app', input: { topic } } }
        : { text: 'It is on the sender profile.' },
  });
  const turn = await runTurn({
    actor: { userId: 'u1', timeZone: 'Europe/Kyiv' } as never,
    today: '2026-10-12',
    history: [],
    message: `Where do I change my ${topic}?`,
    signal: new AbortController().signal,
  });
  for await (const chunk of turn.stream) void chunk;
  return turn.result;
}

describe('find_in_app links on the reply (fix 2026-10-12)', () => {
  it('the bank-accounts page found with no sender profile becomes the sender profiles page', async () => {
    const result = await run('bank account iban');

    expect(result.links).toContainEqual({
      kind: 'page',
      page: 'sender-profiles',
    });
    expect(result.links).not.toContainEqual({
      kind: 'page',
      page: 'sender-profile-bank-accounts',
    });
  });

  it('every link it stores is valid and renders to a route', async () => {
    const result = await run('bank account iban');

    for (const link of result.links) {
      expect(appLinkSchema.safeParse(link).success).toBe(true);
      if (link.kind === 'page')
        expect(() =>
          appPageRoute(link.page, link.senderProfileId)
        ).not.toThrow();
    }
  });
});
