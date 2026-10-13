// ai-chat-v2 T78 (sdd:fix 2026-10-14; ADR-0011 amended; owner decision: English only, no per-field headings): date labels use the
// app format, a question without text gets a default one, an option may carry a secondary `detail` line toFormView passes through.
import { describe, expect, it, vi } from 'vitest';
import { composeForm, dateOptions, formOptionSchema, toFormView } from '@/lib/services/assistant-drafts/forms';

vi.mock('@/lib/services/dashboard/assistant-reads', () => ({}));
vi.mock('@/lib/services/customers/customers', () => ({}));
vi.mock('@/lib/services/sender-profiles/sender-profiles', () => ({}));
vi.mock('@/lib/services/products/products', () => ({}));
vi.mock('@/lib/services/invoices/assistant-search', () => ({}));
vi.mock('@/lib/services/invoices/find-by-reference', () => ({}));

describe('dateOptions labels use the app date format (T78)', () => {
  const labels = (field: 'ISSUE_DATE' | 'DUE_DATE', extra: object = {}) => dateOptions(field, { today: '2026-10-14', ...extra }).map((o) => o.label);

  it('issue date: "Today · Oct 14, 2026", "Yesterday · Oct 13, 2026"', () => {
    expect(labels('ISSUE_DATE')).toEqual(['Today · Oct 14, 2026', 'Yesterday · Oct 13, 2026']);
  });

  it('due date: "7 days after the issue date", with the day once the issue date is known', () => {
    expect(labels('DUE_DATE')).toEqual(['7 days after the issue date', '14 days after the issue date', '30 days after the issue date']);
    expect(labels('DUE_DATE', { issueDate: '2026-10-14' })[0]).toBe('7 days after the issue date · Oct 21, 2026');
  });
});

describe('composeForm default question text and FormView (T78)', () => {
  const draft = { field: 'CUSTOMER', lineIndex: null, prompt: null, options: [], input: 'TEXT', required: true, skippable: false, matchCount: null, source: 'CHAT' } as const;

  it('composeForm writes the field\'s default question when the chat gave no prompt, and no heading', () => {
    const [q] = composeForm([], [{ ...draft }] as never) as unknown as Record<string, unknown>[];
    expect(q.prompt).toBe('Which Customer is this invoice for?');
    expect('heading' in q).toBe(false);
    const [kept] = composeForm([], [{ ...draft, prompt: 'Who pays?' }] as never) as unknown as Record<string, unknown>[];
    expect(kept.prompt).toBe('Who pays?');
    const [line] = composeForm([], [{ ...draft, field: 'PRICE', lineIndex: 1 }] as never) as unknown as Record<string, unknown>[];
    expect(line.prompt).toBe('What price for line 2?');
  });

  const row = (questions: unknown[]) => ({ id: 'f1', kind: 'FORM' as const, state: 'OPEN' as const, lineIndex: null, options: null, chosenOptionId: null, questions, answers: null });
  const stored = (over: object = {}) => ({ questionId: 0, heading: 'Customer', ...draft, options: [{ optionId: 0, label: 'Acme', ref: { customerId: 'c1' }, detail: 'a@x.test' }], ...over });

  it('toFormView passes option detail through; a legacy stored heading is not sent and a missing prompt reads as the default', () => {
    const view = toFormView(row([stored()])) as unknown as { questions: Record<string, unknown>[] };
    expect(view.questions[0].options).toEqual([{ optionId: 0, label: 'Acme', detail: 'a@x.test' }]);
    expect('heading' in view.questions[0]).toBe(false);
    expect(view.questions[0].prompt).toBe('Which Customer is this invoice for?');
  });

  it('an option without detail has no detail key', () => {
    const view = toFormView(row([stored({ options: [{ optionId: 0, label: 'Acme', ref: { customerId: 'c1' } }] })])) as unknown as { questions: { options: unknown[] }[] };
    expect(view.questions[0].options).toEqual([{ optionId: 0, label: 'Acme' }]);
  });

  it('formOptionSchema accepts detail of 1..200 characters only', () => {
    const base = { optionId: 0, label: 'Acme', ref: { customerId: 'c1' } };
    expect(formOptionSchema.safeParse({ ...base, detail: 'a@x.test' }).success).toBe(true);
    expect(formOptionSchema.safeParse({ ...base, detail: '' }).success).toBe(false);
    expect(formOptionSchema.safeParse({ ...base, detail: 'x'.repeat(201) }).success).toBe(false);
  });
});

describe('chat instructions (T78)', () => {
  it('tell the model it may omit recordIds for a record field and the app offers the Freelancer\'s own records', async () => {
    const { CHAT_INSTRUCTIONS } = await import('@/lib/ai/instructions/chat');
    expect(CHAT_INSTRUCTIONS).toMatch(/recordIds[^.]*\b(omit|leave out|without)\b|\b(omit|leave out)\b[^.]*recordIds/i);
    expect(CHAT_INSTRUCTIONS).toMatch(/(app|server)[^.]*\b(offers?|shows?|lists?)\b[^.]*\bown\b[^.]*records/i);
  });
});
