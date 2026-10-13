// Shared assistant view types (contracts/server-actions.md "Shared types", abridged).
import type { DraftProposal } from '@/lib/services/assistant-drafts/schema';
import type { AppLink, FormAnswer } from '@/lib/validations/assistant-chat';

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

// ai-chat-v2 revision 2026-10-13 (ADR-0011; openapi FormField, FormInput, FormAnswer, FormView): the Question form.
/** Which draft field (or none, FREE) a question fills. */
export type FormField =
  | 'CUSTOMER'
  | 'SENDER_PROFILE'
  | 'BANK_ACCOUNT'
  | 'PRODUCT'
  | 'CURRENCY'
  | 'ISSUE_DATE'
  | 'DUE_DATE'
  | 'QUANTITY'
  | 'PRICE'
  | 'TAX_RATE'
  | 'DISCOUNT'
  | 'PO_NUMBER'
  | 'PAYMENT_TERMS'
  | 'NOTES'
  | 'FREE';
/** The typed input a question offers besides its options; NONE = options only. */
export type FormInput = 'NONE' | 'TEXT' | 'AMOUNT' | 'RATE' | 'DISCOUNT' | 'DATE';
/** One sent answer: a picked option, the Freelancer's own typed text, or a skip of an optional question. */
export type { FormAnswer, ChatForm } from '@/lib/validations/assistant-chat';
/** A stored question with its option refs (server only; never sent to the browser). */
export type { StoredFormQuestion } from '@/lib/services/assistant-drafts/forms';

/** A question as the browser sees it: labels only, no refs, no stored request. */
export type FormQuestionView = {
  questionId: number;
  field: FormField;
  lineIndex: number | null;
  prompt: string | null;
  options: Array<{ optionId: number; label: string; detail?: string }>;
  input: FormInput;
  required: boolean;
  skippable: boolean;
  matchCount: number | null;
};

/** What the browser gets for a form (openapi FormView); `answers` only once sent (CHOSEN). */
export type FormView = {
  formId: string;
  state: ChoiceOfferState;
  questions: FormQuestionView[];
  answers: FormAnswer[] | null;
  /** The invoice currency the form's request resolved to (ISO code), null when unknown (T74, R20-13). */
  currency?: string | null;
};

export type ConversationMessageView = {
  id: string;
  role: 'user' | 'assistant';
  /** ai-chat-v2: TYPED / PRESSED / DASHBOARD / FORM on Freelancer messages; null on Assistant replies. */
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
