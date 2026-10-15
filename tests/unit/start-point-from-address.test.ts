// ai-chat-v2 T20 (contracts/server-actions.md §Addresses and start points; spec.md §5 AC-18, AC-30): the start point a
// new Conversation is sent with comes from the address it was opened at. Unknown or missing values are never errors.
import { describe, expect, it } from 'vitest';
import { startPointFromAddress } from '@/components/ai/start-point';

describe('startPointFromAddress', () => {
  it.each([
    [{}, { start: undefined, startedFrom: 'AI_SECTION' }],
    [{ start: 'draft', from: 'invoices' }, { start: 'draft', startedFrom: 'INVOICE_LIST' }],
    [{ start: 'draft', from: 'dashboard' }, { start: 'draft', startedFrom: 'DASHBOARD_CREATE' }],
    [{ start: 'draft' }, { start: 'draft', startedFrom: 'INVOICE_LIST' }],
    [{ start: 'draft', from: 'bogus' }, { start: 'draft', startedFrom: 'AI_SECTION' }],
    [{ start: 'bogus', from: 'dashboard' }, { start: undefined, startedFrom: 'AI_SECTION' }],
    [{ from: 'invoices' }, { start: undefined, startedFrom: 'AI_SECTION' }],
    [{ start: ['draft', 'x'], from: ['dashboard', 'invoices'] }, { start: 'draft', startedFrom: 'DASHBOARD_CREATE' }],
  ])('%j → %j', (params, expected) => {
    expect(startPointFromAddress(params as Record<string, string | string[] | undefined>)).toEqual(expected);
  });

  it('never yields DASHBOARD_PROMPT (the dashboard prompt that used it was removed; the value stays readable in history)', () => {
    for (const from of ['prompt', 'dashboard_prompt', 'DASHBOARD_PROMPT']) {
      expect(startPointFromAddress({ start: 'draft', from }).startedFrom).not.toBe('DASHBOARD_PROMPT');
    }
  });
});
