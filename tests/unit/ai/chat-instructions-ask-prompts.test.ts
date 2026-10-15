// T72 (review R20-9, R20-11): the tool sentence reads right, and open questions get chat-written prompts.
import { describe, expect, it } from 'vitest';
import { CHAT_INSTRUCTIONS } from '@/lib/ai/instructions/chat';

describe('chat instructions (T72)', () => {
  it('the tool sentence has its "and" before "ask"', () => {
    expect(CHAT_INSTRUCTIONS).toContain('with find_in_app, prepare a Draft invoice card with propose_draft, and ask');
  });

  it('tell the model to call ask_user with a one-line prompt in the Freelancer\'s language for each open field', () => {
    const lines = CHAT_INSTRUCTIONS.split('\n').filter(
      (l) => /propose_draft/.test(l) && /ask_user/.test(l) && /one-line prompt/i.test(l) && /language/i.test(l) && /each/i.test(l)
    );
    expect(lines.length).toBeGreaterThan(0);
  });
});
