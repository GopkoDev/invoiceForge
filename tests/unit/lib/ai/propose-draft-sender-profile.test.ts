// fix 2026-10-12 (ai-assistant, AC-17, spec §1 "What a request may set"): the owner could not draft under a sender
// profile other than the default. propose_draft's description listed every field the model may pass except the
// sender profile, and the field itself carried no description, so the model read "use payer Dmytro Hopko" as a
// Customer. The tool the model is offered now names the sender profile. Seam: runTurn with a scripted model.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from 'vitest';
import type { MockLanguageModelV4 } from 'ai/test';
import { scriptedModel } from '../../../support/ai-stub-model';

let model: MockLanguageModelV4;
vi.mock('@/lib/ai/model', () => ({ getChatModel: () => model }));
vi.mock('@/prisma', () => ({ prisma: {} })); // the tool/server import chain loads Prisma; nothing here queries it

import { runTurn } from '@/lib/ai/run-turn';

async function offeredProposeDraft() {
  model = scriptedModel({
    verdict: { topic: 'in_scope', language: 'en', intent: 'draft' },
    steps: () => ({ text: 'ok' }),
  });
  const turn = await runTurn({
    actor: { userId: 'u1', timeZone: 'Europe/Kyiv' } as never,
    today: '2026-10-12',
    history: [],
    message: 'Invoice Acme 1660 USD from my Dmytro Hopko profile',
    signal: new AbortController().signal,
  });
  for await (const chunk of turn.stream) void chunk;
  return ((model.doStreamCalls[0] as any).tools as any[]).find(
    (t) => t.name === 'propose_draft'
  );
}

describe('propose_draft offers the sender profile (fix 2026-10-12)', () => {
  it('the description lists the sender profile among the values to pass', async () => {
    const tool = await offeredProposeDraft();

    expect(tool.description).toMatch(/sender profile/i);
  });

  it('the senderProfile field says what it takes', async () => {
    const tool = await offeredProposeDraft();

    expect(tool.inputSchema.properties.senderProfile.description).toMatch(
      /sender profile/i
    );
  });
});
