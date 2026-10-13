// T72 (review R20-11, AC-08, F2): question text comes from the chat, never from the resolver's English message.
import { describe, expect, it } from 'vitest';
import { composeForm, formFromIssues, type FormQuestionDraft } from '@/lib/services/assistant-drafts/forms';

const ctx = { today: '2026-10-13', timeZone: 'Europe/Kyiv' };

describe('T72 question text of resolver questions', () => {
  it('a FIELD_INVALID question has no English resolver message as its prompt', () => {
    const qs = formFromIssues([{ kind: 'FIELD_INVALID', field: 'taxRate', message: 'Tax rate must be 100 or less.' }], ctx);
    expect(qs).toHaveLength(1);
    expect(qs[0].prompt).toBeNull();
  });

  // Guard: composeForm already behaves this way (may pass before T72).
  it('composeForm keeps the resolver options and takes the chat prompt for the same field and line', () => {
    const resolver: FormQuestionDraft[] = formFromIssues(
      [
        {
          kind: 'PRODUCT_AMBIGUOUS',
          lineIndex: 1,
          written: 'Design',
          candidates: [
            { productId: 'p1', name: { freelancerText: 'Design' }, unit: 'hour', price: '50.00', currency: 'USD' },
            { productId: 'p2', name: { freelancerText: 'Design pro' }, unit: 'day', price: '400.00', currency: 'USD' },
          ],
        } as never,
      ],
      ctx
    );
    expect(resolver[0].options).toHaveLength(2);
    const chat: FormQuestionDraft[] = [{ ...resolver[0], options: [], prompt: 'Який саме дизайн?', source: 'CHAT' } as FormQuestionDraft];
    const form = composeForm(resolver, chat);
    expect(form).toHaveLength(1);
    expect(form[0].prompt).toBe('Який саме дизайн?');
    expect(form[0].options.map((o) => o.label)).toEqual(resolver[0].options.map((o) => o.label));
    expect(form[0].options).toHaveLength(2);
  });
});
