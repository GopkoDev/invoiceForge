import 'server-only';
import type { ZodError } from 'zod';
import { zodValidationFailure } from '@/lib/services/_shared/result-helpers';
import type { TurnResult } from '@/lib/ai/run-turn';
import type { ConversationMessageView } from '@/types/assistant/types';

export type ChatOutcome =
  | 'ANSWERED'
  | 'PARTIAL'
  | 'COULD_NOT_COMPLETE'
  | 'AI_UNAVAILABLE';

export const TOO_LONG_MESSAGE =
  'Messages can be at most 2,000 characters. Shorten it and send again.';
export const CONVERSATION_TITLE_LENGTH = 80;

/** The chat outcome the client sees for a finished turn, and whether it counted. */
export function chatOutcomeOf(result: TurnResult): {
  outcome: ChatOutcome;
  counted: boolean;
} {
  if (result.outcome === 'ANSWERED')
    return { outcome: 'ANSWERED', counted: true };
  if (result.outcome === 'CAPPED') return { outcome: 'PARTIAL', counted: true };
  return {
    outcome:
      result.failure === 'PROVIDER' ? 'AI_UNAVAILABLE' : 'COULD_NOT_COMPLETE',
    counted: false,
  };
}

/** A 400 VALIDATION body for a request the schema refused; the length refusal carries the contract wording. */
export function chatValidationFailure(error: ZodError) {
  const failure = zodValidationFailure(error);
  const tooLong = error.issues.some(
    (i) => i.code === 'too_big' && i.path.join('.') === 'message.parts.0.text'
  );
  if (!tooLong) return failure;
  return {
    ...failure,
    error: TOO_LONG_MESSAGE,
    fieldErrors: {
      ...failure.fieldErrors,
      'message.parts.0.text': [TOO_LONG_MESSAGE],
    },
  };
}

/** The visible content of the Assistant message that is saved: its text, its links and its card. */
export function assistantPartsOf(
  result: TurnResult
): ConversationMessageView['parts'] {
  const parts: ConversationMessageView['parts'] = [];
  if (result.text) parts.push({ type: 'text', text: result.text });
  for (const link of result.links)
    parts.push({ type: 'data-link', data: link });
  if (result.pendingCard) {
    parts.push({
      type: 'data-draft-card',
      id: result.pendingCard.id,
      data: { cardId: result.pendingCard.id },
    });
  }
  return parts;
}
