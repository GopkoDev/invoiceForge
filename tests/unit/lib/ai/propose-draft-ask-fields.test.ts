// T72 (review R20-11, AC-08): the propose_draft ISSUES result lists the fields the form will ask, so the model can
// write one prompt per field through ask_user. Pinned shape: `askFields: Array<{ field: FormField; lineIndex: number | null }>`,
// one entry per open resolver question, in the order of the form's questions (formFromIssues order).
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/services/assistant-drafts/resolve', () => ({
  resolveDraftRequest: vi.fn(async () => ({
    success: true,
    data: {
      kind: 'ISSUES',
      issues: [
        { kind: 'LINE_QUANTITY_MISSING', lineIndex: 2, written: 'Design' },
        { kind: 'FIELD_INVALID', field: 'taxRate', message: 'Tax rate must be 100 or less.' },
      ],
    },
  })),
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
});
