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

// ai-chat-v2 (contracts/server-actions.md §Shared types): Offered choices, message origin, start point.
/** `FORM`: every row written after the revision 2026-10-13 (ADR-0011); the legacy kinds name a backfilled question. */
export type ChoiceOfferKind = 'CUSTOMER' | 'SENDER_PROFILE' | 'CURRENCY' | 'BANK_ACCOUNT' | 'PRODUCT' | 'FORM';
export type ChoiceOfferState = 'OPEN' | 'CHOSEN' | 'CLOSED';
/** Who or what sent a Freelancer message; NULL on Assistant replies. Set by the server only. `PRESSED` is history (ADR-0011). */
export type MessageOrigin = 'TYPED' | 'PRESSED' | 'DASHBOARD' | 'FORM';
export type ConversationStartPoint = 'AI_SECTION' | 'INVOICE_LIST' | 'DASHBOARD_PROMPT' | 'DASHBOARD_CREATE';

/**
 * Offered choices as the browser sees them: 1..8 options of position + label only. No record reference and no
 * stored request ever leave the server (ADR-0001, ADR-0003).
 */
export type OfferView = {
  offerId: string;
  kind: ChoiceOfferKind;
  state: ChoiceOfferState;
  chosenOptionId: number | null;
  options: Array<{ optionId: number; label: string }>;
};

export type ConversationMessageView = {
  id: string;
  role: 'user' | 'assistant';
  /** ai-chat-v2: TYPED / PRESSED / DASHBOARD on Freelancer messages; null on Assistant replies. */
  origin: MessageOrigin | null;
  parts: Array<
    | { type: 'text'; text: string }
    | { type: 'data-link'; data: AppLink }
    | { type: 'data-draft-card'; id: string; data: { cardId: string } }
    /** ai-chat-v2: the reply's Offered choices, by offer id only (ADR-0001). */
    | { type: 'data-offer'; id: string; data: { offerId: string } }
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
