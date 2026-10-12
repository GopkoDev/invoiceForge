import type { ActingFreelancer } from '@/lib/services/_shared/acting-freelancer';
import type { DraftProposal, DraftRequest } from '@/lib/services/assistant-drafts/schema';

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
  pending: { card: { id: string; request: DraftRequest; proposal: DraftProposal } | null };
}

export function createTurnContext(input: {
  actor: ActingFreelancer;
  today: string;
  origin?: string;
}): TurnContext {
  return {
    actor: input.actor,
    today: input.today,
    origin: input.origin ?? DEFAULT_ORIGIN,
    pending: { card: null },
  };
}
