// Shared assistant view types (contracts/server-actions.md "Shared types", abridged).
import type { DraftProposal } from '@/lib/services/assistant-drafts/schema';
import type { AppLink } from '@/lib/validations/assistant-chat';

/** The status in words, derived by the shared overdue rule (ADR-0005). */
export type InvoiceDisplayStatus = 'draft' | 'pending' | 'overdue' | 'paid' | 'cancelled';

export type DraftCardState = 'LIVE' | 'REPLACED' | 'OUTDATED' | 'CREATED';

/** Read when rendered, never stored (AC-36). */
export type LinkedInvoiceState =
  | { state: 'DRAFT'; invoiceId: string; invoiceNumber: string }
  | { state: 'ISSUED'; invoiceId: string; invoiceNumber: string; status: InvoiceDisplayStatus }
  | { state: 'UNAVAILABLE' };

export type DraftCardView = {
  id: string;
  state: DraftCardState;
  proposal: DraftProposal;
  replacedById: string | null;
  invoice: LinkedInvoiceState | null;
};

export type ConversationSummary = { id: string; title: string; lastMessageAt: string };

export type ConversationMessageView = {
  id: string;
  role: 'user' | 'assistant';
  parts: Array<
    | { type: 'text'; text: string }
    | { type: 'data-link'; data: AppLink }
    | { type: 'data-draft-card'; id: string; data: { cardId: string } }
  >;
  createdAt: string;
};

/** The AssistantTurn row without ids: metadata only, never text (AC-35). */
export type AssistantTurnMetadata = {
  topic: 'IN_SCOPE' | 'MIXED' | 'OFF_TOPIC' | null;
  outcome: 'ANSWERED' | 'CAPPED' | 'FAILED' | 'ALLOWANCE_USED_UP';
  counted: boolean;
  steps: number;
  toolNames: string[];
  durationMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
};
