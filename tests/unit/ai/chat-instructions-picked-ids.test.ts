// T71 (review R20-3, AC-10, F6): the chat instructions tell the model to pass the ids found in a form's answers to
// propose_draft instead of names, so a picked record is never matched again by name.
import { describe, expect, it } from 'vitest';
import { CHAT_INSTRUCTIONS } from '@/lib/ai/instructions/chat';

describe('chat instructions: ids from a form\'s answers (T71)', () => {
  it('say to pass the ids from a form\'s answers to propose_draft instead of names', () => {
    const lines = CHAT_INSTRUCTIONS.split('\n').filter((l) => /answers/i.test(l) && /propose_draft/.test(l) && /\bids?\b/i.test(l));
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.some((l) => /instead of (the )?names?/i.test(l))).toBe(true);
  });

  it('name the id fields to pass', () => {
    expect(CHAT_INSTRUCTIONS).toContain('customerId');
    expect(CHAT_INSTRUCTIONS).toContain('senderProfileId');
    expect(CHAT_INSTRUCTIONS).toContain('productId');
  });
});
