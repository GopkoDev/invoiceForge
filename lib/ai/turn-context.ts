import type { ActingFreelancer } from '@/lib/services/_shared/acting-freelancer';
import { createId } from '@paralleldrive/cuid2';
import type { DraftIssue, DraftProposal, DraftRequest } from '@/lib/services/assistant-drafts/schema';

/**
 * ai-chat-v2 T01 (ADR-0003): what the press path resolved in code before the turn - the draft request with the
 * chosen record pinned, and the resolver's answer to it. Mirrors `DraftResolution` without importing the
 * server-only resolver.
 */
export interface PinnedResolution {
  request: DraftRequest;
  resolution: { kind: 'PROPOSAL'; proposal: DraftProposal } | { kind: 'ISSUES'; issues: DraftIssue[] };
}

/** Used for absolute links inside tool answers when the route supplies no origin. */
const DEFAULT_ORIGIN = process.env.AUTH_URL ?? 'http://localhost:3000';

/**
 * What one chat turn's tools close over: the acting Freelancer bound by the route (never an id from
 * the model), today in their time zone, and the slot a prepared card is parked in (filled by propose_draft; the last call wins).
 */
export interface TurnContext {
  actor: ActingFreelancer;
  /** Today as `YYYY-MM-DD` in the Freelancer's time zone. */
  today: string;
  origin: string;
  /** True only when the router judged the Freelancer's own message to ask for a draft; propose_draft parks no card otherwise (AC-15). */
  draftIntent: boolean;
  pending: { card: { id: string; request: DraftRequest; proposal: DraftProposal } | null };
  /** The pinned draft request of a pressed choice (ADR-0003), or null; propose_draft re-applies it on a re-call (T13). */
  pins: DraftRequest | null;
}

export function createTurnContext(input: {
  actor: ActingFreelancer;
  today: string;
  origin?: string;
  draftIntent?: boolean;
  pinned?: PinnedResolution;
}): TurnContext {
  const { pinned } = input;
  // A pinned PROPOSAL is the turn's card from the start: code resolved it, the model cannot re-match it (AC-10).
  const card =
    pinned?.resolution.kind === 'PROPOSAL'
      ? { id: createId(), request: pinned.request, proposal: pinned.resolution.proposal }
      : null;
  return {
    actor: input.actor,
    today: input.today,
    origin: input.origin ?? DEFAULT_ORIGIN,
    // A press continues a draft the Freelancer asked for, whatever the router reads in the button label.
    draftIntent: pinned ? true : (input.draftIntent ?? false),
    pending: { card },
    pins: pinned?.request ?? null,
  };
}
