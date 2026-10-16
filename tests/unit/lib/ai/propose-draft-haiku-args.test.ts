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
  // T120 / review W1 (owner decision): this was "both given keeps customerId" in T115. The rule changed: the
  // Freelancer's words win unless customerId is the id of an option chosen in a form answered this turn.
  it('both customer and customerId, no form answer this turn: keeps `customer`, drops customerId', () => {
    const tool = createProposeDraftTool(makeTurn()) as unknown as AnyTool;
    const r = tool.inputSchema.safeParse({ customer: 'Acme', customerId: 'c1', lines: LINES });
    expect(r.success).toBe(true);
    expect(r.data?.customer).toBe('Acme');
    expect(r.data).not.toHaveProperty('customerId');
  });

  // The answered form choice lives on the turn as `answeredRecordIds` (string[]): the record ids of options the
  // Freelancer chose in a form answered this turn (pinned press or sent form). TurnContext has no such field yet;
  // the implementer adds it and run-turn fills it from input.pinned.request / input.priorAnswers.
  const withAnswer = (ids: string[]) => Object.assign(makeTurn(), { answeredRecordIds: ids });
  const OK_ISSUES = { success: true, data: { kind: 'ISSUES', issues: [] } };

  it('execute passes `customer` (not customerId) to the resolver when both are given and no form was answered', async () => {
    resolveDraftRequest.mockReset().mockResolvedValue(OK_ISSUES);
    const tool = createProposeDraftTool(makeTurn()) as unknown as AnyTool;
    await tool.execute({ customer: 'Acme', customerId: 'c1', lines: LINES }, {});
    expect(resolveDraftRequest).toHaveBeenCalledTimes(1);
    const request = resolveDraftRequest.mock.calls[0][1];
    expect(request.customer).toBe('Acme');
    expect(request).not.toHaveProperty('customerId');
  });

  it('execute passes customerId when it equals the option chosen in a form answered this turn', async () => {
    resolveDraftRequest.mockReset().mockResolvedValue(OK_ISSUES);
    const tool = createProposeDraftTool(withAnswer(['c1'])) as unknown as AnyTool;
    await tool.execute({ customer: 'Acme', customerId: 'c1', lines: LINES }, {});
    const request = resolveDraftRequest.mock.calls[0][1];
    expect(request.customerId).toBe('c1');
    expect(request).not.toHaveProperty('customer');
  });

  it('a customerId that is not the answered option is dropped in favour of `customer`', async () => {
    resolveDraftRequest.mockReset().mockResolvedValue(OK_ISSUES);
    const tool = createProposeDraftTool(withAnswer(['c1'])) as unknown as AnyTool;
    await tool.execute({ customer: 'Acme', customerId: 'foreign', lines: LINES }, {});
    const request = resolveDraftRequest.mock.calls[0][1];
    expect(request.customer).toBe('Acme');
    expect(request).not.toHaveProperty('customerId');
  });

  it('both senderProfile and senderProfileId (T115 rule, unchanged unless T120 decides otherwise): keeps senderProfileId', () => {
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

  const NO_CUSTOMER_RUN = async (extra: Record<string, unknown> = {}, turn = makeTurn()) => {
    resolveDraftRequest.mockClear();
    const tool = createProposeDraftTool(turn) as unknown as AnyTool;
    const out = (await tool.execute({ lines: LINES, ...extra }, {})) as { answer?: Record<string, unknown>; commit?: () => void };
    out.commit?.();
    return { turn, answer: (out.answer ?? out) as Record<string, unknown> };
  };

  it('T120: no Customer: the commit sets turn.pending.resolver with an input-only CUSTOMER question and no card', async () => {
    const { turn } = await NO_CUSTOMER_RUN();
    expect(turn.pending.card).toBeNull();
    expect(turn.pending.resolver).not.toBeNull();
    const customerQ = turn.pending.resolver!.questions.find((q) => q.field === 'CUSTOMER');
    expect(customerQ).toBeDefined();
    expect(customerQ!.options).toHaveLength(0);
  });

  it('T120: senderProfile given and no Customer: say names it as the sender profile and asks with a question mark', async () => {
    const { answer } = await NO_CUSTOMER_RUN({ senderProfile: 'Consulting FOP' });
    const say = String(answer.say);
    expect(say).toContain('Consulting FOP');
    expect(say.toLowerCase()).toContain('sender profile');
    expect(say).toContain('?');
  });

  it('T120: guard order with no Customer: draftIntent false -> NOT_REQUESTED', async () => {
    const turn = createTurnContext({ actor: { userId: 'u1', timeZone: 'Europe/Kyiv' } as never, today: '2026-10-16', draftIntent: false });
    const { answer } = await NO_CUSTOMER_RUN({}, turn);
    expect(answer.kind).toBe('NOT_REQUESTED');
    expect(turn.pending.resolver).toBeNull();
  });

  it('T120: guard order with no Customer: a pinned turn returns the pinned answer', async () => {
    const turn = makeTurn();
    turn.pinnedAnswer = { kind: 'CARD', cardId: 'k1' };
    const { answer } = await NO_CUSTOMER_RUN({}, turn);
    expect(answer).toMatchObject({ kind: 'CARD', cardId: 'k1' });
    expect(turn.pending.resolver).toBeNull();
  });

  it('the MCP schema still refuses both customer and customerId, and neither', () => {
    expect(createDraftInvoiceInputSchema.safeParse({ customer: 'A', customerId: 'c1', lines: LINES }).success).toBe(false);
    expect(createDraftInvoiceInputSchema.safeParse({ lines: LINES }).success).toBe(false);
  });

  it('T120: ask_user keeps both lines in order; the blank one becomes "Line 1" and keeps its quantity', () => {
    const tool = createAskUserTool(makeTurn()) as unknown as AnyTool;
    const r = tool.inputSchema.safeParse({
      draft: { customer: 'Acme', lines: [{ description: '', quantity: '176' }, { description: 'Design' }] },
      questions: [{ field: 'PRICE', lineIndex: 1, prompt: 'Price of Design?' }],
    });
    expect(r.success).toBe(true);
    const lines = (r.data?.draft as { lines: Array<Record<string, unknown>> }).lines;
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ description: 'Line 1', quantity: '176' });
    expect(lines[1].description).toBe('Design');
  });
});
