// T25 (ai-assistant; spec.md §5 AC-35): one AssistantTurn row per exchange - metadata only, never text.
import 'server-only';
import { prisma } from '@/prisma';
import { ok, type ActionResult } from '@/types/result';
import type { ActingFreelancer } from '@/lib/services/_shared/acting-freelancer';
import { writeTurnRow } from '@/lib/services/assistant-usage/turn-row';
import { failed } from '@/lib/services/_shared/result-helpers';
import type { AssistantTurnMetadata } from '@/types/assistant/types';

/** How many turns (any outcome) this Freelancer has started since `since`; null when it cannot be read. */
export async function countRecentTurns(
  actor: ActingFreelancer,
  since: Date
): Promise<number | null> {
  try {
    return await prisma.assistantTurn.count({
      where: { userId: actor.userId, createdAt: { gte: since } },
    });
  } catch {
    return null;
  }
}

/** A failed or unavailable turn saves only its metadata, with no Conversation. */
export async function recordTurnMetadata(
  actor: ActingFreelancer,
  turn: AssistantTurnMetadata
): Promise<ActionResult<void>> {
  try {
    await writeTurnRow(prisma, actor.userId, null, turn);
    return ok(undefined);
  } catch (error) {
    return failed(
      'recordTurnMetadata failed',
      error,
      "We couldn't save this turn."
    );
  }
}
