// ai-chat-v2 T17 (contracts/server-actions.md §loadInvoicePreview, §issueFromPreview, §ActionResult changes):
// every result the two actions return has the shape and the words the contract fixes. Unit tier: the session
// and the services are test doubles; the database is never reached.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const actorResult = vi.fn();
const getCardInvoicePreview = vi.fn();
const issueInvoiceFromPreview = vi.fn();
vi.mock('@/lib/helpers/session-actor', () => ({ actingFreelancerFromSession: () => actorResult() }));
vi.mock('@/lib/services/assistant-drafts/cards', () => ({
  createFromCard: vi.fn(),
  getCardInvoicePreview: (...a: unknown[]) => getCardInvoicePreview(...a),
}));
vi.mock('@/lib/services/invoices/invoices', () => ({
  issueInvoiceFromPreview: (...a: unknown[]) => issueInvoiceFromPreview(...a),
}));
vi.mock('@/lib/services/conversations/conversations', () => ({ getConversation: vi.fn() }));
vi.mock('@/lib/services/conversations/delete', () => ({ deleteConversation: vi.fn(), deleteAllConversations: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@sentry/nextjs', () => ({ startSpan: (_o: unknown, run: (s?: unknown) => unknown) => run(undefined) }));

const { loadInvoicePreview, issueFromPreview } = await import('@/lib/actions/assistant-actions');

const linkedState = z.discriminatedUnion('state', [
  z.object({ state: z.literal('DRAFT'), invoiceId: z.string(), invoiceNumber: z.string() }).strict(),
  z.object({ state: z.literal('ISSUED'), invoiceId: z.string(), invoiceNumber: z.string(), status: z.string() }).strict(),
  z.object({ state: z.literal('UNAVAILABLE') }).strict(),
]);
const previewOk = z
  .object({
    success: z.literal(true),
    data: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('AVAILABLE'), invoice: z.object({ id: z.string() }).passthrough(), version: z.number().int(), state: linkedState }).strict(),
      z.object({ kind: z.literal('UNAVAILABLE') }).strict(),
    ]),
  })
  .strict();
const issueOk = z
  .object({ success: z.literal(true), data: z.object({ status: z.string(), version: z.number().int(), invoice: linkedState }).strict() })
  .strict();
const failure = (code: string, error: string) =>
  z.object({ success: z.literal(false), code: z.literal(code), error: z.literal(error) }).passthrough();

const DRAFT = { state: 'DRAFT', invoiceId: 'inv1', invoiceNumber: 'INV-1' } as const;
const ISSUED = { state: 'ISSUED', invoiceId: 'inv1', invoiceNumber: 'INV-1', status: 'pending' } as const;

describe('loadInvoicePreview / issueFromPreview result shapes (ai-chat-v2 T17)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actorResult.mockResolvedValue({ success: true, data: { userId: 'u1', timeZone: 'UTC' } });
  });

  it('AVAILABLE and UNAVAILABLE previews match the contract', async () => {
    getCardInvoicePreview.mockResolvedValueOnce({ success: true, data: { kind: 'AVAILABLE', invoice: { id: 'inv1' }, version: 4, state: DRAFT } });
    expect(previewOk.safeParse(await loadInvoicePreview('card1', 'c1')).success).toBe(true);
    getCardInvoicePreview.mockResolvedValueOnce({ success: true, data: { kind: 'UNAVAILABLE' } });
    expect(previewOk.safeParse(await loadInvoicePreview('card1', 'c1')).success).toBe(true);
  });

  it('preview refusals: NOT_FOUND and FAILED in the contract words', async () => {
    getCardInvoicePreview.mockResolvedValueOnce({ success: false, code: 'NOT_FOUND', error: "This invoice can't be found." });
    expect(failure('NOT_FOUND', "This invoice can't be found.").safeParse(await loadInvoicePreview('card1', 'c1')).success).toBe(true);
    getCardInvoicePreview.mockResolvedValueOnce({ success: false, code: 'FAILED', error: 'whatever the service said' });
    expect(await loadInvoicePreview('card1', 'c1')).toEqual({ success: false, code: 'FAILED', error: "The preview couldn't be loaded. Try again." });
  });

  // Review 2026-10-13 R10-1: without a valid open Conversation the preview is not found, never unscoped.
  it('a missing, empty or over-long conversationId is NOT_FOUND without a read', async () => {
    for (const id of [undefined, '', 'x'.repeat(65)]) {
      expect(await loadInvoicePreview('card1', id as unknown as string)).toEqual({
        success: false,
        code: 'NOT_FOUND',
        error: "This invoice can't be found.",
      });
    }
    expect(getCardInvoicePreview).not.toHaveBeenCalled();
  });

  it('the issue success matches the contract', async () => {
    issueInvoiceFromPreview.mockResolvedValueOnce({ success: true, data: { status: 'PENDING', version: 5, invoice: ISSUED } });
    expect(issueOk.safeParse(await issueFromPreview('inv1', 4)).success).toBe(true);
    expect(issueInvoiceFromPreview).toHaveBeenCalledWith({ userId: 'u1', timeZone: 'UTC' }, 'inv1', 4);
  });

  it('issue refusals map per the contract', async () => {
    issueInvoiceFromPreview.mockResolvedValueOnce({ success: false, code: 'NOT_FOUND', error: 'Invoice not found.' });
    expect(await issueFromPreview('inv1', 4)).toEqual({ success: false, code: 'NOT_FOUND', error: 'This invoice is no longer available.' });

    const already = { success: false, code: 'CONFLICT', error: 'This invoice has already been issued.', details: { kind: 'ALREADY_ISSUED', invoice: ISSUED } };
    issueInvoiceFromPreview.mockResolvedValueOnce(already);
    expect(await issueFromPreview('inv1', 4)).toEqual(already);

    const outdated = {
      success: false,
      code: 'CONFLICT',
      error: 'This draft was changed after you opened the preview. Check it and issue again.',
      details: { kind: 'CHANGED_ELSEWHERE', currentVersion: 6 },
    };
    issueInvoiceFromPreview.mockResolvedValueOnce(outdated);
    expect(await issueFromPreview('inv1', 4)).toEqual(outdated);

    const invalid = { success: false, code: 'VALIDATION', error: 'This account is in USD while the invoice is in EUR.', fieldErrors: { bankAccountId: ['x'] } };
    issueInvoiceFromPreview.mockResolvedValueOnce(invalid);
    expect(await issueFromPreview('inv1', 4)).toEqual(invalid);

    issueInvoiceFromPreview.mockResolvedValueOnce({ success: false, code: 'FAILED', error: 'Failed to update invoice status.' });
    expect(await issueFromPreview('inv1', 4)).toEqual({ success: false, code: 'FAILED', error: "The invoice couldn't be issued. Try again." });
  });

  it('a bad expectedVersion is VALIDATION and no service is called', async () => {
    for (const v of [-1, 1.5, '3', undefined]) {
      expect(await issueFromPreview('inv1', v as number)).toMatchObject({ success: false, code: 'VALIDATION' });
    }
    expect(issueInvoiceFromPreview).not.toHaveBeenCalled();
  });

  it('no session: UNAUTHORIZED, no service is called', async () => {
    actorResult.mockResolvedValue({ success: false, code: 'UNAUTHORIZED', error: 'Not signed in.' });
    expect(await loadInvoicePreview('card1', 'c1')).toMatchObject({ code: 'UNAUTHORIZED' });
    expect(await issueFromPreview('inv1', 4)).toMatchObject({ code: 'UNAUTHORIZED' });
    expect(getCardInvoicePreview).not.toHaveBeenCalled();
    expect(issueInvoiceFromPreview).not.toHaveBeenCalled();
  });
});
