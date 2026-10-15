// T72 (review R20-11, AC-08): the propose_draft ISSUES result lists the fields the form will ask, so the model can
// write one prompt per field through ask_user. Pinned shape: `askFields: Array<{ field: FormField; lineIndex: number | null }>`,
// one entry per open resolver question, in the order of the form's questions (formFromIssues order).
import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ issues: [] as unknown[] }));
const DEFAULT_ISSUES = [
  { kind: 'LINE_QUANTITY_MISSING', lineIndex: 2, written: 'Design' },
  { kind: 'FIELD_INVALID', field: 'taxRate', message: 'Tax rate must be 100 or less.' },
];
state.issues = DEFAULT_ISSUES;

vi.mock('@/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/services/assistant-drafts/resolve', () => ({
  resolveDraftRequest: vi.fn(async () => ({ success: true, data: { kind: 'ISSUES', issues: state.issues } })),
}));

const { createTurnContext } = await import('@/lib/ai/turn-context');
const { createProposeDraftTool } = await import('@/lib/ai/tools/propose-draft');

describe('propose_draft ISSUES result: askFields (T72)', () => {
  it('lists the field and lineIndex of each open question', async () => {
    const actor = { userId: 'u1', timeZone: 'Europe/Kyiv' } as never;
    const turn = createTurnContext({ actor, today: '2026-10-13', draftIntent: true });
    const tool = createProposeDraftTool(turn) as unknown as { execute: (i: unknown, c: unknown) => Promise<Record<string, unknown>> };
    const answer = await tool.execute({ customer: 'Acme', lines: [{ description: 'Design', quantity: '1' }] }, {});
    expect(answer.kind).toBe('ISSUES');
    expect(answer.askFields).toEqual([
      { field: 'QUANTITY', lineIndex: 2 },
      { field: 'TAX_RATE', lineIndex: null },
    ]);
  });

  // T76 (review R21-2): askFields are the questions the form will hold: composeForm order (F1), at most 6.
  it('lists at most 6 fields, in the F1 order the form keeps, when more than 6 questions are open', async () => {
    state.issues = [
      { kind: 'LINE_PRICE_MISSING_IN_CURRENCY', lineIndex: 2, currency: 'USD', products: [] },
      { kind: 'LINE_AMOUNT_MISSING', lineIndex: 1, description: 'B' },
      { kind: 'LINE_QUANTITY_MISSING', lineIndex: 0, written: 'A', description: 'A' },
      { kind: 'LINE_AMOUNT_MISSING', lineIndex: 0, description: 'A' },
      { kind: 'LINE_QUANTITY_MISSING', lineIndex: 2, written: 'C', description: 'C' },
      { kind: 'CUSTOMER_NOT_FOUND', written: 'Acme' },
      { kind: 'FIELD_INVALID', field: 'taxRate', message: 'x' },
    ];
    const actor = { userId: 'u1', timeZone: 'Europe/Kyiv' } as never;
    const turn = createTurnContext({ actor, today: '2026-10-13', draftIntent: true });
    const tool = createProposeDraftTool(turn) as unknown as { execute: (i: unknown, c: unknown) => Promise<Record<string, unknown>> };
    const answer = await tool.execute({ customer: 'Acme', lines: [{ description: 'A', quantity: '1' }] }, {});
    state.issues = DEFAULT_ISSUES;
    expect(answer.kind).toBe('ISSUES');
    const askFields = answer.askFields as Array<{ field: string; lineIndex: number | null }>;
    expect(askFields).toHaveLength(6);
    expect(askFields).toEqual([
      { field: 'CUSTOMER', lineIndex: null },
      { field: 'QUANTITY', lineIndex: 0 },
      { field: 'PRICE', lineIndex: 0 },
      { field: 'PRICE', lineIndex: 1 },
      { field: 'QUANTITY', lineIndex: 2 },
      { field: 'PRICE', lineIndex: 2 },
    ]);
  });
});
