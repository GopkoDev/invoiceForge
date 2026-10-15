import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MockLanguageModelV4 } from 'ai/test';

// Scripted-model seam: getChatModel() is swapped for an AI SDK mock model. The real model is never called.
let model: MockLanguageModelV4;
vi.mock('@/lib/ai/model', () => ({ getChatModel: () => model }));

import { classifyMessage } from '@/lib/ai/router';
import { MIXED_INSTRUCTION, OFF_TOPIC_REFUSAL } from '@/lib/ai/instructions/refusal';

function scripted(verdict: { topic: string; language: string; intent?: string | null }) {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: 'text', text: JSON.stringify(verdict) }],
      finishReason: { unified: 'stop', raw: 'stop' },
      usage: {
        inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 1, text: 1, reasoning: 0 },
      },
      warnings: [],
    }),
  });
}

describe('topic router (ADR-0005)', () => {
  beforeEach(() => {
    model = scripted({ topic: 'in_scope', language: 'en', intent: 'read' });
  });

  it('fixed refusal is the spec sentence in English and a non-empty single Ukrainian sentence', () => {
    expect(OFF_TOPIC_REFUSAL.en).toBe(
      'I can only help with your own data in Invoice Forge, drafting invoices, and finding things in the app.',
    );
    expect(OFF_TOPIC_REFUSAL.uk.length).toBeGreaterThan(0);
    expect(OFF_TOPIC_REFUSAL.uk).not.toBe(OFF_TOPIC_REFUSAL.en);
    expect(OFF_TOPIC_REFUSAL.uk.match(/[.!?](\s|$)/g)).toHaveLength(1);
  });

  it('AC-06: an entirely off-topic message returns OFF_TOPIC with the fixed English refusal and no tools sent', async () => {
    model = scripted({ topic: 'off_topic', language: 'en', intent: 'read' });
    const r = await classifyMessage({
      message: 'Should I charge VAT to a client abroad?',
      recentTurns: [],
    });
    expect(r.topic).toBe('OFF_TOPIC');
    expect(r.language).toBe('en');
    expect(r.refusal).toBe(OFF_TOPIC_REFUSAL.en);
    expect(r.instruction).toBeUndefined();
    expect(model.doGenerateCalls).toHaveLength(1);
    expect(model.doGenerateCalls[0].tools ?? []).toHaveLength(0);
  });

  it('AC-06: a Ukrainian off-topic message gets the Ukrainian refusal', async () => {
    model = scripted({ topic: 'off_topic', language: 'uk', intent: 'read' });
    const r = await classifyMessage({ message: 'Чи треба нараховувати ПДВ клієнту за кордоном?', recentTurns: [] });
    expect(r.topic).toBe('OFF_TOPIC');
    expect(r.language).toBe('uk');
    expect(r.refusal).toBe(OFF_TOPIC_REFUSAL.uk);
  });

  it('AC-06b: a mixed message returns MIXED with the refuse-the-rest instruction and no refusal short-circuit', async () => {
    model = scripted({ topic: 'mixed', language: 'en', intent: 'read' });
    const r = await classifyMessage({
      message: 'invoice Acme for 20 hours at $50 and tell me if I need to charge VAT',
      recentTurns: [],
    });
    expect(r.topic).toBe('MIXED');
    expect(r.instruction).toBe(MIXED_INSTRUCTION);
    expect(MIXED_INSTRUCTION).toMatch(/one sentence/i);
    expect(r.refusal).toBeUndefined();
  });

  it('an in-scope message passes through with no refusal and no instruction', async () => {
    const r = await classifyMessage({ message: 'how much did Acme pay me this year?', recentTurns: [] });
    expect(r.topic).toBe('IN_SCOPE');
    expect(r.refusal).toBeUndefined();
    expect(r.instruction).toBeUndefined();
  });

  it('classifies over the new message plus the recent turns', async () => {
    await classifyMessage({
      message: 'the second one',
      recentTurns: [
        { role: 'user', content: 'zzmarker-earlier-turn invoice Acme' },
        { role: 'assistant', content: 'Which Acme?' },
      ],
    });
    const sent = JSON.stringify(model.doGenerateCalls[0].prompt);
    expect(sent).toContain('the second one');
    expect(sent).toContain('zzmarker-earlier-turn');
  });

  // N-5: a model that leaves intent out, or invents a value, must not fail the turn; it reads as no drafting request.
  it.each([
    ['missing', { topic: 'in_scope', language: 'en' }],
    ['invalid', { topic: 'in_scope', language: 'en', intent: 'create' }],
    ['null', { topic: 'in_scope', language: 'en', intent: null }],
  ])('a verdict with a %s intent classifies as intent read, not a failure', async (_label, verdict) => {
    model = scripted(verdict as never);
    const r = await classifyMessage({ message: 'how much did Acme pay me this year?', recentTurns: [] });
    expect(r.topic).toBe('IN_SCOPE');
    expect(r.intent).toBe('read');
  });

  it('a verdict without intent keeps its topic handling (off-topic refusal, mixed instruction)', async () => {
    model = scripted({ topic: 'off_topic', language: 'uk' } as never);
    const off = await classifyMessage({ message: 'x', recentTurns: [] });
    expect(off.topic).toBe('OFF_TOPIC');
    expect(off.intent).toBe('read');
    expect(off.refusal).toBe(OFF_TOPIC_REFUSAL.uk);
    model = scripted({ topic: 'mixed', language: 'en' } as never);
    const mixed = await classifyMessage({ message: 'x', recentTurns: [] });
    expect(mixed.topic).toBe('MIXED');
    expect(mixed.intent).toBe('read');
  });

  // T45 (P-4): intent is lenient, topic is not; a topic outside the enum still fails the turn.
  it('a verdict with an unknown topic rejects (no silent verdict)', async () => {
    model = scripted({ topic: 'bogus', language: 'en', intent: 'read' });
    await expect(classifyMessage({ message: 'hello', recentTurns: [] })).rejects.toThrow();
  });

  it('a failing classification call rejects so the turn fails system-side (no silent verdict)', async () => {
    model = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new Error('gateway down');
      },
    });
    await expect(classifyMessage({ message: 'hello', recentTurns: [] })).rejects.toThrow();
  });

  // ai-chat-v2 T63 (sad §5 Chat behaviour): the draft intent also covers issue / виставити / create ... invoice.
  it('T63: the classification prompt tells the router that issue, виставити and create ... invoice mean intent draft', async () => {
    await classifyMessage({ message: 'виставити інвойс для Acme', recentTurns: [] });
    const system = JSON.stringify(model.doGenerateCalls[0].prompt);
    expect(system).toMatch(/issue/i);
    expect(system).toContain('виставити');
    expect(system).toMatch(/create[^"]*invoice/i);
  });

  it('T63: the verdict intent draft passes through for an issue request', async () => {
    model = scripted({ topic: 'in_scope', language: 'uk', intent: 'draft' });
    const r = await classifyMessage({ message: 'виставити інвойс для Acme', recentTurns: [] });
    expect(r.intent).toBe('draft');
  });
});

// ai-chat-v2 T117 (AC-15): changing an existing draft or invoice is not a drafting intent.
describe('router prompt: changing an existing draft or invoice (T117)', () => {
  it('says add/remove a line or edit a value on an existing draft or invoice is read, not draft', async () => {
    model = scripted({ topic: 'in_scope', language: 'en', intent: 'read' });
    await classifyMessage({ message: 'Add a line for the website to my draft', recentTurns: [] });
    const sent = JSON.stringify(model.doGenerateCalls[0].prompt);
    expect(sent).toMatch(/(change|edit)[^.]*existing (draft|invoice)[^.]*\bread\b/i);
    expect(sent).toMatch(/add or remove a line|remove a line/i);
  });
});
