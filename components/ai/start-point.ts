// ai-chat-v2 T20 (contracts/server-actions.md §Addresses and start points; spec.md §5 AC-18, AC-30): where a new
// Conversation was opened from, read from the /ai address. Pure. An unknown `from`, or `start=draft` with no `from`,
// maps per the contract and is never an error. DASHBOARD_PROMPT is never derived here (the dashboard hand-off was
// removed 2026-10-14; the origin is deprecated).
import type { ConversationStartPoint } from '@/types/assistant/types';

type Param = string | string[] | undefined;

const first = (value: Param) => (Array.isArray(value) ? value[0] : value);

export function startPointFromAddress(params: { start?: Param; from?: Param }): {
  start: 'draft' | undefined;
  startedFrom: ConversationStartPoint;
} {
  if (first(params.start) !== 'draft') return { start: undefined, startedFrom: 'AI_SECTION' };
  const from = first(params.from);
  if (from === undefined || from === 'invoices') return { start: 'draft', startedFrom: 'INVOICE_LIST' };
  if (from === 'dashboard') return { start: 'draft', startedFrom: 'DASHBOARD_CREATE' };
  return { start: 'draft', startedFrom: 'AI_SECTION' };
}
