// ai-chat-v2 T118: the eval report says why each failing row failed.
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/prisma', () => ({ prisma: {} }));

import { formatRowFailures, type NoGuessingRow, type TopicRow } from '../../../evals/assistant/score';

const ng = (over: Partial<NoGuessingRow>): NoGuessingRow => ({
  id: 'ok-row', expect: 'card', hasCard: true, ungroundedValues: [], ...over,
});

describe('formatRowFailures (T118)', () => {
  it('lists each failing no-guessing row with its reasons and the reply cut to 200 chars; passing rows are left out', () => {
    const reply = 'x'.repeat(500);
    const out = formatRowFailures(
      [ng({ id: 'AC-16-custom-price', expect: 'question', hasCard: true, ungroundedValues: ['99'], replyText: reply }), ng({})],
      []
    ).join('\n');
    expect(out).toMatch(/^ {2}- AC-16-custom-price: .*unexpected|card/m);
    expect(out).toContain('ungrounded: 99');
    expect(out).toContain('x'.repeat(200));
    expect(out).not.toContain('x'.repeat(201));
    expect(out).not.toContain('ok-row');
  });

  it('joins several reasons with "; "', () => {
    const out = formatRowFailures([ng({ id: 'r1', expect: 'none', hasCard: true, ungroundedValues: ['7'] })], []).join('\n');
    expect(out).toContain('  - r1: unexpected card; ungrounded: 7');
  });

  it('prints a failing topic row with its text, expected and got; passing topic rows are left out', () => {
    const bad: TopicRow = {
      text: 'Add a line for the website to my draft and write me a slogan for it',
      label: 'mixed', refused: false, intent: 'read', verdictIntent: 'draft',
    };
    const good: TopicRow = { text: 'fine row', label: 'in_scope', refused: false };
    const out = formatRowFailures([], [bad, good]).join('\n');
    expect(out).toContain(bad.text);
    expect(out).toMatch(/expected[^\n]*read/i);
    expect(out).toMatch(/got[^\n]*draft/i);
    expect(out).not.toContain('fine row');
  });
});
