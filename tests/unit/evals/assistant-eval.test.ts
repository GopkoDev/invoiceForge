import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MockLanguageModelV4 } from 'ai/test';

// Scripted-model seam: the real model is never called by the unit suite (T32 harness tests only).
let model: MockLanguageModelV4;
vi.mock('@/lib/ai/model', () => ({ getChatModel: () => model }));

import {
  loadNoGuessingSet,
  loadTopicSet,
  NO_GUESSING_THRESHOLDS,
  TOPIC_THRESHOLDS,
  TOPIC_MIN_SIZE,
} from '@/evals/assistant/dataset';
import { scoreNoGuessing, scoreTopicBoundary } from '@/evals/assistant/score';
import { runTopicBoundary, evaluateRun } from '@/evals/assistant/run';

const ROOT = process.cwd();

function scripted(topic: string, language = 'en') {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: 'text', text: JSON.stringify({ topic, language }) }],
      finishReason: { unified: 'stop', raw: 'stop' },
      usage: {
        inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 1, text: 1, reasoning: 0 },
      },
      warnings: [],
    }),
  });
}

describe('T32 thresholds (spec §6)', () => {
  it('pins the NFR numbers', () => {
    expect(TOPIC_MIN_SIZE).toBe(100);
    expect(TOPIC_THRESHOLDS).toEqual({ offTopicRefusedMin: 0.95, inScopeRefusedMax: 0.05 });
    expect(NO_GUESSING_THRESHOLDS).toEqual({ questionRateMin: 1, ungroundedValuesMax: 0 });
  });
});

describe('topic-boundary set (AC-06, AC-06b)', () => {
  const items = loadTopicSet();

  it('has at least 100 labelled questions, each with text, label and lang', () => {
    expect(items.length).toBeGreaterThanOrEqual(100);
    for (const i of items) {
      expect(i.text.trim().length).toBeGreaterThan(0);
      expect(['in_scope', 'mixed', 'off_topic']).toContain(i.label);
      expect(['en', 'uk']).toContain(i.lang);
    }
  });

  it('has enough of each side for 5 % to be measurable, in both languages, without duplicates', () => {
    const count = (l: string) => items.filter((i) => i.label === l).length;
    expect(count('off_topic')).toBeGreaterThanOrEqual(40);
    expect(count('in_scope')).toBeGreaterThanOrEqual(40);
    expect(count('mixed')).toBeGreaterThanOrEqual(5);
    for (const lang of ['en', 'uk']) {
      expect(items.filter((i) => i.lang === lang && i.label === 'off_topic').length).toBeGreaterThanOrEqual(10);
      expect(items.filter((i) => i.lang === lang && i.label === 'in_scope').length).toBeGreaterThanOrEqual(10);
    }
    expect(new Set(items.map((i) => i.text.toLowerCase())).size).toBe(items.length);
  });

  it("contains the spec's own examples with the right label", () => {
    const byText = (s: string) => items.find((i) => i.text.toLowerCase().includes(s));
    expect(byText('charge vat to a client abroad')?.label).toBe('off_topic');
    expect(byText('tell me if i need to charge vat')?.label).toBe('mixed');
    expect(byText('logo')).toBeDefined();
    expect(byText('acme')?.label).toMatch(/in_scope|mixed/);
    expect(items.some((i) => /paid this year/i.test(i.text) && i.label === 'in_scope')).toBe(true);
  });

  it('is plain JSONL, one object per line, no real-data markers', () => {
    const raw = readFileSync(join(ROOT, 'evals/assistant/topic-boundary.jsonl'), 'utf8');
    const lines = raw.split('\n').filter(Boolean);
    expect(lines).toHaveLength(items.length);
    expect(raw).not.toMatch(/@[a-z0-9-]+\.[a-z]{2,}/i);
  });
});

describe('no-guessing set (AC-16b, AC-17, AC-19..AC-22 + controls)', () => {
  const items = loadNoGuessingSet();

  it('has incomplete/ambiguous requests and complete controls with an expected outcome', () => {
    expect(items.length).toBeGreaterThanOrEqual(8);
    for (const i of items) {
      expect(i.text.length).toBeGreaterThan(0);
      expect(['incomplete', 'ambiguous', 'complete']).toContain(i.kind);
      expect(i.expect).toBe(i.kind === 'complete' ? 'card' : 'question');
      expect(i.ac).toMatch(/^AC-\d+b?$/);
    }
    const acs = new Set(items.map((i) => i.ac));
    for (const ac of ['AC-12', 'AC-16', 'AC-16b', 'AC-17', 'AC-19', 'AC-20', 'AC-21', 'AC-22']) {
      expect(acs.has(ac), ac).toBe(true);
    }
    expect(items.some((i) => i.expect === 'card')).toBe(true);
    expect(items.some((i) => i.expect === 'question')).toBe(true);
  });
});

describe('scoreTopicBoundary', () => {
  const mk = (label: 'in_scope' | 'mixed' | 'off_topic', refused: boolean, n: number, tag: string = label) =>
    Array.from({ length: n }, (_, k) => ({ text: `${tag}-${refused}-${k}`, label, refused }));

  it('computes both rates; mixed counts as in-scope', () => {
    const r = scoreTopicBoundary([
      ...mk('off_topic', true, 19),
      ...mk('off_topic', false, 1),
      ...mk('in_scope', false, 18),
      ...mk('mixed', true, 2),
    ]);
    expect(r.offTopicRefusedRate).toBeCloseTo(0.95);
    expect(r.inScopeRefusedRate).toBeCloseTo(0.1);
    expect(r.passed).toBe(false);
    expect(r.failures.map((f) => f.text)).toContain('mixed-true-0');
  });

  it('passes exactly at 95 % and 5 %, fails just below / above', () => {
    const base = [...mk('off_topic', true, 19), ...mk('off_topic', false, 1)];
    const ok = scoreTopicBoundary([...base, ...mk('in_scope', false, 19), ...mk('in_scope', true, 1)]);
    expect(ok.passed).toBe(true);
    const lowRefusal = scoreTopicBoundary([
      ...mk('off_topic', true, 18),
      ...mk('off_topic', false, 2),
      ...mk('in_scope', false, 20),
    ]);
    expect(lowRefusal.passed).toBe(false);
    const overRefusal = scoreTopicBoundary([
      ...mk('off_topic', true, 20),
      ...mk('in_scope', false, 18),
      ...mk('in_scope', true, 2),
    ]);
    expect(overRefusal.passed).toBe(false);
  });

  it('lists the failing items (wrongly answered off-topic, wrongly refused in-scope)', () => {
    const r = scoreTopicBoundary([...mk('off_topic', false, 1, 'bad'), ...mk('in_scope', true, 1, 'worse')]);
    expect(r.failures.map((f) => f.text).sort()).toEqual(['bad-false-0', 'worse-true-0']);
  });
});

describe('scoreNoGuessing', () => {
  const q = (id: string, over = {}) => ({ id, expect: 'question' as const, hasCard: false, ungroundedValues: [], ...over });

  it('passes only at 100 % questions, 0 ungrounded values and controls that get a card', () => {
    expect(scoreNoGuessing([q('a'), { ...q('b'), expect: 'card', hasCard: true }]).passed).toBe(true);
    expect(scoreNoGuessing([q('a'), q('b', { hasCard: true })]).passed).toBe(false);
    expect(scoreNoGuessing([q('a'), { ...q('c'), expect: 'card', hasCard: true, ungroundedValues: ['price 99'] }]).passed).toBe(false);
    expect(scoreNoGuessing([q('a'), { ...q('d'), expect: 'card', hasCard: false }]).passed).toBe(false);
  });

  it('reports the question rate, ungrounded count and failing ids', () => {
    const r = scoreNoGuessing([q('a'), q('b', { hasCard: true }), q('c', { ungroundedValues: ['x', 'y'] })]);
    expect(r.questionRate).toBeCloseTo(2 / 3);
    expect(r.ungroundedCount).toBe(2);
    expect(r.failures.map((f) => f.id).sort()).toEqual(['b', 'c']);
  });
});

describe('runTopicBoundary (scripted router, no real model)', () => {
  const items = [
    { text: 'Should I charge VAT to a client abroad?', label: 'off_topic' as const, lang: 'en' as const },
    { text: 'How much did Acme pay me this year?', label: 'in_scope' as const, lang: 'en' as const },
    { text: 'invoice Acme for 20 hours and tell me about VAT', label: 'mixed' as const, lang: 'en' as const },
  ];

  beforeEach(() => {
    model = scripted('off_topic');
  });

  it('treats only an OFF_TOPIC verdict as a refusal', async () => {
    const all = await runTopicBoundary(items);
    expect(all.map((r) => r.refused)).toEqual([true, true, true]);
    model = scripted('in_scope');
    expect((await runTopicBoundary(items)).map((r) => r.refused)).toEqual([false, false, false]);
    model = scripted('mixed');
    expect((await runTopicBoundary(items)).map((r) => r.refused)).toEqual([false, false, false]);
  });
});

describe('evaluateRun (exit code + report)', () => {
  const topicOk = { passed: true, offTopicRefusedRate: 1, inScopeRefusedRate: 0, failures: [] };
  const ngOk = { passed: true, questionRate: 1, ungroundedCount: 0, failures: [] };

  it('exits 0 only when both gates pass', () => {
    expect(evaluateRun({ topic: topicOk, noGuessing: ngOk }).exitCode).toBe(0);
    expect(evaluateRun({ topic: { ...topicOk, passed: false, failures: [{ text: 'VAT?', label: 'off_topic' as const, refused: false }] }, noGuessing: ngOk }).exitCode).toBe(1);
    expect(evaluateRun({ topic: topicOk, noGuessing: { ...ngOk, passed: false, failures: [{ id: 'AC-20-1' }] } }).exitCode).toBe(1);
  });

  it('lists the failing items in the report', () => {
    const r = evaluateRun({
      topic: { ...topicOk, passed: false, failures: [{ text: 'Should I charge VAT?', label: 'off_topic' as const, refused: false }] },
      noGuessing: { ...ngOk, passed: false, failures: [{ id: 'AC-20-1' }] },
    });
    expect(r.report).toContain('Should I charge VAT?');
    expect(r.report).toContain('AC-20-1');
  });
});

describe('wiring', () => {
  it('package.json has eval:assistant pointing at evals/assistant/run.ts, and the unit suite does not run evals', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    expect(pkg.scripts['eval:assistant']).toContain('evals/assistant/run.ts');
    expect(pkg.scripts['test:unit']).not.toContain('eval');
    expect(pkg.scripts['test']).not.toContain('eval:assistant');
  });
});
