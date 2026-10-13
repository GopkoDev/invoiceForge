// ai-chat-v2 T09 (AC-05, AC-05b, AC-24): the chat instructions name exactly the reads the registry holds,
// state the sender profile versus Customer rule, and keep the only-the-Freelancer-issues answer.
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/services/dashboard/assistant-reads', () => ({}));
vi.mock('@/lib/services/customers/customers', () => ({}));
vi.mock('@/lib/services/sender-profiles/sender-profiles', () => ({}));
vi.mock('@/lib/services/products/products', () => ({}));
vi.mock('@/lib/services/invoices/assistant-search', () => ({}));
vi.mock('@/lib/services/invoices/find-by-reference', () => ({}));

const OTHER_TOOLS = ['propose_draft', 'find_in_app'];

async function load() {
  const { READ_QUESTIONS } = await import('@/lib/assistant-tools');
  const { CHAT_INSTRUCTIONS } = await import('@/lib/ai/instructions/chat');
  return { names: READ_QUESTIONS.map((q) => q.definition.name), text: CHAT_INSTRUCTIONS };
}

describe('CHAT_INSTRUCTIONS (ai-chat-v2 T09)', () => {
  it('AC-05: names every read question of the registry exactly', async () => {
    const { names, text } = await load();
    expect(names.length).toBeGreaterThanOrEqual(9);
    for (const n of names) expect(text, `missing ${n}`).toContain(n);
  });

  it('AC-05: names no tool that does not exist', async () => {
    const { names, text } = await load();
    const known = new Set([...names, ...OTHER_TOOLS]);
    const mentioned = text.match(/\b[a-z]+(?:_[a-z]+)+\b/g) ?? [];
    expect(mentioned.filter((m) => !known.has(m))).toEqual([]);
  });

  it('AC-05b: says a sender profile is the Freelancer\'s own business and a Customer is who pays', async () => {
    const { text } = await load();
    expect(text).toMatch(/sender profile/i);
    expect(text).toContain('Customer');
    expect(text).toMatch(/sender profile[^.]*\b(your|their|the Freelancer's) own\b[^.]*\binvoice from\b/i);
    expect(text).toMatch(/Customer[^.]*\b(who|that|the (one|party)[^.]*) pays\b/i);
  });

  it('AC-24: only the Freelancer can issue, and the answer points to the preview or editor', async () => {
    const { text } = await load();
    expect(text).toMatch(/only the Freelancer can issue/i);
    expect(text).toMatch(/preview/i);
  });

  it('AC-24: no read question in the registry is an issuing or status-changing verb', async () => {
    const { names } = await load();
    for (const n of names) {
      expect(n).not.toMatch(/(^|_)(issue|send|edit|update|delete|cancel|mark|status)(_|$)/i);
    }
  });
});
