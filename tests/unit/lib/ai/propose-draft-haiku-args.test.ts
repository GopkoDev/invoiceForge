// ai-chat-v2 T115 (AC-04, AC-08, AC-14): Claude Haiku calls propose_draft with both customer and customerId, both
// senderProfile and senderProfileId, or no Customer at all, and asks ask_user with an empty line description. The chat
// tool tolerates all of it; the MCP create_draft_invoice schema stays strict.
import { describe, expect, it, vi } from 'vitest';

const resolveDraftRequest = vi.hoisted(() => vi.fn());
// T128: the Freelancer's own sender profiles, read owner-scoped through prisma by the resolver's matching rule
// (exact folded match, or exactly one profile whose name contains the written words).
const ownProfiles = vi.hoisted(() => ({ rows: [{ id: 'sp1', name: 'Consulting FOP', isDefault: false }] as Array<{ id: string; name: string; isDefault: boolean }> }));
vi.mock('@/prisma', () => ({ prisma: { senderProfile: { findMany: vi.fn(async () => ownProfiles.rows) } } }));
vi.mock('@/lib/services/assistant-drafts/resolve', () => ({ resolveDraftRequest }));
// T125: the no-Customer branch reuses the resolver's line resolution without a Customer. resolveLines reads the
// Freelancer's products through prisma (mocked empty above), so it is mocked here: a line with no price and no product
// comes back as the issue the real resolver gives, LINE_AMOUNT_MISSING.
const resolveLines = vi.hoisted(() =>
  vi.fn(async (request: { lines: Array<unknown> }) => ({
    lines: [],
    issues: request.lines.map((_l, lineIndex) => ({ kind: 'LINE_AMOUNT_MISSING', lineIndex, description: 'web dev' })),
  })),
);
vi.mock('@/lib/services/assistant-drafts/resolve-lines', () => ({ resolveLines }));
// T123 W-2: the owner-scoped check of a name against the Freelancer's own sender profiles. Mocked: 'Consulting FOP' is
// one of this Freelancer's own profiles, 'Acme' is not.
const isOwnSenderProfileName = vi.hoisted(() => vi.fn(async (_actor: unknown, name: string) => name === 'Consulting FOP'));
vi.mock('@/lib/services/sender-profiles/sender-profiles', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/services/sender-profiles/sender-profiles')>()),
  isOwnSenderProfileName,
}));

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
  // Freelancer chose in a form answered this turn (pinned press or sent form); run-turn fills it from
  // input.pinned.request / input.priorAnswers.
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

  // T123 W-1: the same rule as the Customer. The Freelancer's written senderProfile wins unless senderProfileId is the
  // id of an option chosen in a form answered this turn.
  it('both senderProfile and senderProfileId, no form answer this turn: keeps senderProfile, drops the id', () => {
    const tool = createProposeDraftTool(makeTurn()) as unknown as AnyTool;
    const r = tool.inputSchema.safeParse({ customer: 'Acme', senderProfile: 'Studio', senderProfileId: 'sp1', lines: LINES });
    expect(r.success).toBe(true);
    expect(r.data?.senderProfile).toBe('Studio');
    expect(r.data).not.toHaveProperty('senderProfileId');
  });

  it('both senderProfile and senderProfileId, the id answered in a form this turn: keeps the id', () => {
    const tool = createProposeDraftTool(withAnswer(['sp1'])) as unknown as AnyTool;
    const r = tool.inputSchema.safeParse({ customer: 'Acme', senderProfile: 'Studio', senderProfileId: 'sp1', lines: LINES });
    expect(r.success).toBe(true);
    expect(r.data?.senderProfileId).toBe('sp1');
    expect(r.data).not.toHaveProperty('senderProfile');
  });

  it('execute passes senderProfile (not the id) to the resolver when no form was answered', async () => {
    resolveDraftRequest.mockReset().mockResolvedValue(OK_ISSUES);
    const tool = createProposeDraftTool(makeTurn()) as unknown as AnyTool;
    await tool.execute({ customer: 'Acme', senderProfile: 'Studio', senderProfileId: 'sp1', lines: LINES }, {});
    const request = resolveDraftRequest.mock.calls[0][1];
    expect(request.senderProfile).toBe('Studio');
    expect(request).not.toHaveProperty('senderProfileId');
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

  // T123 W-2: the own-profile directive only when the name is one of the Freelancer's own sender profiles; the name
  // travels as the data field `ownSenderProfile: { freelancerText }`, never inside the directive sentence.
  it('T123: senderProfile that is one of the Freelancer\'s own: own-profile directive, name in ownSenderProfile only', async () => {
    const { answer } = await NO_CUSTOMER_RUN({ senderProfile: 'Consulting FOP' });
    const say = String(answer.say);
    expect(isOwnSenderProfileName).toHaveBeenCalledWith(expect.anything(), 'Consulting FOP');
    // T125: the issue's shape { name: { freelancerText } } (schema.ts), and the exact question to end the reply with.
    expect(answer.ownSenderProfile).toEqual({ name: { freelancerText: 'Consulting FOP' } });
    expect(say).toContain('Which Customer should this invoice be for?');
    expect(say).not.toContain('Consulting FOP');
    expect(say.toLowerCase()).toContain('sender profile');
    expect(say).toContain('?');
  });

  it('T123: senderProfile that matches no own profile: the plain no-Customer directive, no ownSenderProfile', async () => {
    const { answer, turn } = await NO_CUSTOMER_RUN({ senderProfile: 'Acme' });
    const say = String(answer.say);
    expect(answer).not.toHaveProperty('ownSenderProfile');
    expect(turn.pending.resolver!.request).not.toHaveProperty('senderProfile');
    expect(say).not.toContain('Acme');
    expect(say).toContain('No Customer was given');
    expect(say.toLowerCase()).not.toContain('own sender profile');
  });

  // T125 (AC-05b, AC-37, AC-46): the no-Customer form also asks what the lines lack.
  it('T125: no Customer and a line without a price: the form asks CUSTOMER and PRICE (line 0)', async () => {
    const { turn, answer } = await NO_CUSTOMER_RUN({ lines: [{ description: 'web dev', quantity: '10' }] });
    const fields = (answer.askFields as Array<{ field: string; lineIndex: number | null }>).map((f) => f.field);
    expect(fields).toContain('CUSTOMER');
    expect(fields).toContain('PRICE');
    const price = turn.pending.resolver!.questions.find((q) => q.field === 'PRICE');
    expect(turn.pending.resolver!.questions.map((q) => q.field)).toContain('CUSTOMER');
    expect(price).toBeDefined();
    expect(price!.lineIndex).toBe(0);
  });

  // T123 N-1: the own-profile check is awaited, so parallel no-Customer calls can commit out of order. Call 0 names a
  // sender profile and waits on the (held) own-profile lookup; call 1 commits first; releasing call 0 must not
  // overwrite the later call's question. (Commits run inside withToolBudget, after the answer is charged.)
  it('T123: two no-Customer calls whose commits run out of order: the later call stays in turn.pending.resolver', async () => {
    let release: (v: boolean) => void = () => {};
    isOwnSenderProfileName.mockImplementationOnce(() => new Promise<boolean>((r) => (release = r)));
    const turn = makeTurn();
    const tool = createProposeDraftTool(turn) as unknown as AnyTool;
    const slow = tool.execute({ senderProfile: 'Slow', lines: [{ description: 'First', quantity: '1', price: '1' }] }, {});
    const fast = tool.execute({ lines: [{ description: 'Second', quantity: '1', price: '1' }] }, {});
    await fast;
    expect(turn.pending.resolver!.request.lines[0].description).toBe('Second');
    release(false);
    await slow;
    expect(turn.pending.resolver!.request.lines[0].description).toBe('Second');
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

// ai-chat-v2 T128 (AC-46, AC-37, AC-09): the no-Customer branch keeps a partly written profile, reads the currency like
// the resolver, logs a failed line resolution, and asks every field.
describe('no-Customer branch (T128)', () => {
  const run = async (extra: Record<string, unknown> = {}, lines: unknown[] = [{ description: 'web dev', quantity: '10' }]) => {
    const turn = makeTurn();
    const tool = createProposeDraftTool(turn) as unknown as AnyTool;
    const out = (await tool.execute({ lines, ...extra }, {})) as { answer?: Record<string, unknown>; commit?: () => void };
    out.commit?.();
    return { turn, answer: (out.answer ?? out) as Record<string, unknown> };
  };
  const fieldsOf = (turn: ReturnType<typeof makeTurn>) => turn.pending.resolver!.questions.map((q) => q.field);

  it('resolveLines gets an owner-only context: userId u1, no customerId', async () => {
    resolveLines.mockClear();
    await run();
    expect(resolveLines).toHaveBeenCalledTimes(1);
    const ctx = resolveLines.mock.calls[0][1] as Record<string, unknown>;
    expect(ctx.userId).toBe('u1');
    expect(ctx).not.toHaveProperty('customerId');
  });

  it("a written '$' is read like the resolver does: the line context currency is USD", async () => {
    resolveLines.mockClear();
    await run({ currency: '$' });
    expect((resolveLines.mock.calls[0][1] as Record<string, unknown>).currency).toBe('USD');
  });

  it('no currency written: PRODUCT_AMBIGUOUS issues are not asked, LINE_AMOUNT_MISSING still is', async () => {
    resolveLines.mockImplementationOnce((async () => ({
      lines: [],
      issues: [
        { kind: 'PRODUCT_AMBIGUOUS', lineIndex: 0, written: 'web dev', candidates: [] },
        { kind: 'LINE_AMOUNT_MISSING', lineIndex: 1, description: 'logo' },
      ],
    })) as never);
    const { turn, answer } = await run({}, [{ description: 'web dev', quantity: '1' }, { description: 'logo', quantity: '1' }]);
    expect(fieldsOf(turn)).toContain('CUSTOMER');
    expect(fieldsOf(turn)).toContain('PRICE');
    expect(fieldsOf(turn)).not.toContain('PRODUCT');
    expect((answer.askFields as Array<{ field: string }>).map((f) => f.field)).not.toContain('PRODUCT');
  });

  it('a written currency keeps the PRODUCT question', async () => {
    resolveLines.mockImplementationOnce((async () => ({
      lines: [],
      issues: [{ kind: 'PRODUCT_AMBIGUOUS', lineIndex: 0, written: 'web dev', candidates: [] }],
    })) as never);
    const { turn } = await run({ currency: 'EUR' });
    expect(fieldsOf(turn)).toContain('PRODUCT');
  });

  it('resolveLines rejecting: a CUSTOMER-only form and a logged no_customer_lines_failed line', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    resolveLines.mockRejectedValueOnce(new Error('db down'));
    const { turn } = await run();
    expect(fieldsOf(turn)).toEqual(['CUSTOMER']);
    expect(spy.mock.calls.some((c) => typeof c[0] === 'string' && c[0].startsWith('no_customer_lines_failed'))).toBe(true);
    spy.mockRestore();
  });

  it("a partly written profile ('Consulting' for the own 'Consulting FOP') stays in the stored request", async () => {
    const { turn, answer } = await run({ senderProfile: 'Consulting' });
    expect(turn.pending.resolver!.request.senderProfile).toBe('Consulting');
    expect(answer).not.toHaveProperty('ownSenderProfile');
  });

  it('a written name that two profiles contain is dropped from the stored request', async () => {
    const saved = ownProfiles.rows;
    ownProfiles.rows = [
      { id: 'sp1', name: 'Consulting FOP', isDefault: false },
      { id: 'sp2', name: 'Consulting LLC', isDefault: false },
    ];
    try {
      const { turn } = await run({ senderProfile: 'Consulting' });
      expect(turn.pending.resolver!.request).not.toHaveProperty('senderProfile');
    } finally {
      ownProfiles.rows = saved;
    }
  });

  it('NO_CUSTOMER_SAY and the own-profile say tell the model to prompt each askFields field', async () => {
    const plain = await run();
    expect(String(plain.answer.say)).toContain('each askFields field');
    const own = await run({ senderProfile: 'Consulting FOP' });
    expect(String(own.answer.say)).toContain('each askFields field');
  });
});
