// ai-chat-v2 T115 (AC-04, AC-08, AC-14): Claude Haiku calls propose_draft with both customer and customerId, both
// senderProfile and senderProfileId, or no Customer at all, and asks ask_user with an empty line description. The chat
// tool tolerates all of it; the MCP create_draft_invoice schema stays strict.
import { describe, expect, it, vi } from 'vitest';

const resolveDraftRequest = vi.hoisted(() => vi.fn());
vi.mock('@/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/services/assistant-drafts/resolve', () => ({ resolveDraftRequest }));

const { createTurnContext } = await import('@/lib/ai/turn-context');
const { createProposeDraftTool } = await import('@/lib/ai/tools/propose-draft');
const { createAskUserTool } = await import('@/lib/ai/tools/ask-user');
const { createDraftInvoiceInputSchema } = await import('@/lib/services/assistant-drafts/schema');

const LINES = [{ description: 'Design', quantity: '1', price: '100' }];
const makeTurn = () =>
  createTurnContext({ actor: { userId: 'u1', timeZone: 'Europe/Kyiv' } as never, today: '2026-10-16', draftIntent: true });
type AnyTool = {
  inputSchema: { safeParse: (v: unknown) => { success: boolean; data?: Record<string, unknown>; error?: unknown } };
  execute: (i: unknown, c: unknown) => Promise<Record<string, unknown>>;
};

describe('propose_draft tolerates Haiku arguments (T115)', () => {
  it('both customer and customerId: keeps customerId, drops customer', () => {
    const tool = createProposeDraftTool(makeTurn()) as unknown as AnyTool;
    const r = tool.inputSchema.safeParse({ customer: 'Acme', customerId: 'c1', lines: LINES });
    expect(r.success).toBe(true);
    expect(r.data?.customerId).toBe('c1');
    expect(r.data).not.toHaveProperty('customer');
  });

  it('both senderProfile and senderProfileId: keeps senderProfileId', () => {
    const tool = createProposeDraftTool(makeTurn()) as unknown as AnyTool;
    const r = tool.inputSchema.safeParse({ customer: 'Acme', senderProfile: 'Studio', senderProfileId: 'sp1', lines: LINES });
    expect(r.success).toBe(true);
    expect(r.data?.senderProfileId).toBe('sp1');
    expect(r.data).not.toHaveProperty('senderProfile');
  });

  it('no Customer: the input is accepted and execute answers ISSUES asking for CUSTOMER, no card, resolver not called', async () => {
    resolveDraftRequest.mockClear();
    const turn = makeTurn();
    const tool = createProposeDraftTool(turn) as unknown as AnyTool;
    expect(tool.inputSchema.safeParse({ lines: LINES }).success).toBe(true);
    const out = (await tool.execute({ lines: LINES }, {})) as { answer?: Record<string, unknown>; commit?: () => void };
    const answer = (out.answer ?? out) as Record<string, unknown>;
    out.commit?.();
    expect(answer.kind).toBe('ISSUES');
    expect((answer.askFields as Array<{ field: string }>).map((f) => f.field)).toContain('CUSTOMER');
    expect(turn.pending.card).toBeNull();
    expect(resolveDraftRequest).not.toHaveBeenCalled();
  });

  it('the MCP schema still refuses both customer and customerId, and neither', () => {
    expect(createDraftInvoiceInputSchema.safeParse({ customer: 'A', customerId: 'c1', lines: LINES }).success).toBe(false);
    expect(createDraftInvoiceInputSchema.safeParse({ lines: LINES }).success).toBe(false);
  });

  it('ask_user accepts a draft line whose description is empty (the line is dropped)', () => {
    const tool = createAskUserTool(makeTurn()) as unknown as AnyTool;
    const r = tool.inputSchema.safeParse({
      draft: { customer: 'Acme', lines: [{ description: '' }, { description: 'Design' }] },
      questions: [{ field: 'CUSTOMER', prompt: 'Which Customer?' }],
    });
    expect(r.success).toBe(true);
  });
});
