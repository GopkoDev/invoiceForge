// ai-chat-v2 T09 (AC-05, AC-05b, AC-24): the chat instructions name exactly the reads the registry holds,
// state the sender profile versus Customer rule, and keep the only-the-Freelancer-issues answer.
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/services/dashboard/assistant-reads', () => ({}));
vi.mock('@/lib/services/customers/customers', () => ({}));
vi.mock('@/lib/services/sender-profiles/sender-profiles', () => ({}));
vi.mock('@/lib/services/products/products', () => ({}));
vi.mock('@/lib/services/invoices/assistant-search', () => ({}));
vi.mock('@/lib/services/invoices/find-by-reference', () => ({}));

// T63: ask_user (the chat-only Question form tool, T54) joins the known non-read tools.
const OTHER_TOOLS = ['propose_draft', 'find_in_app', 'ask_user'];

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

// ai-chat-v2 T63 (AC-45..AC-48, spec F11/F12, ADR-0011, ADR-0012): the instructions teach forms over prose questions,
// search before "add one", allowlisted in-app links with the tools' paths, and the created-date filters.
describe('CHAT_INSTRUCTIONS (ai-chat-v2 T63)', () => {
  it('AC-05: names ask_user as a known tool', async () => {
    const { text } = await load();
    expect(text).toContain('ask_user');
  });

  it('AC-46: a draft request is answered with propose_draft or an ask_user form, never a list of prose questions', async () => {
    const { text } = await load();
    expect(text).toContain('propose_draft');
    expect(text).toMatch(/ask_user/);
    expect(text).toMatch(/prose/i);
    expect(text).toMatch(/(never|not|instead of)[^.]*prose|prose[^.]*(never|not)/i);
    expect(text).toMatch(/(never|not) ask[^.]*(find|look up|search)/i);
  });

  it('AC-47: searches for a named Customer or product before saying it is missing or telling to add one', async () => {
    const { text } = await load();
    expect(text).toMatch(/search/i);
    expect(text).toMatch(/before[^.]*(add|does not exist|no such|nothing matches)/i);
    expect(text).toMatch(/only after[^.]*search/i);
  });

  it('AC-48: allows Markdown links to the allowlisted in-app paths and to search row paths; never says it cannot link', async () => {
    const { text } = await load();
    expect(text).toMatch(/Markdown link/i);
    expect(text).toMatch(/\bpath\b/i);
    expect(text).toMatch(/search_invoices[^\n]*path|path[^\n]*search_invoices/i);
    expect(text).toMatch(/only[^\n]*(allowed|allowlist)|allowlist/i);
    expect(text).toMatch(/never say[^.]*(cannot|can't|unable)[^.]*link/i);
  });

  it('F12: tells the model to use createdFrom / createdTo and the created-date sort for "created in January" questions', async () => {
    const { text } = await load();
    expect(text).toContain('createdFrom');
    expect(text).toContain('createdTo');
    expect(text).toMatch(/created/i);
  });

  it('F11: date rules - month without year is the latest one not after today, a period means the issue date, "created" the creation day', async () => {
    const { text } = await load();
    expect(text).toMatch(/not after today/i);
    expect(text).toMatch(/issue date/i);
    expect(text).toMatch(/last <?weekday>?|last (Monday|weekday)/i);
  });

  it('supersedes the old style rules: tables/markup ban and "Link ... by naming them" are gone', async () => {
    const { text } = await load();
    expect(text).not.toMatch(/Do not use tables, headings or other markup/);
    expect(text).not.toMatch(/by naming them/);
  });

  it('AC-24 stays: the model still has no issuing tool and says only the Freelancer can issue', async () => {
    const { text } = await load();
    expect(text).toMatch(/only the Freelancer can issue/i);
  });
});
