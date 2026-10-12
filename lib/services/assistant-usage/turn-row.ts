// T25 (ai-assistant; spec.md §5 AC-35): writes the AssistantTurn row - metadata only, never text.
import 'server-only';
import type { Prisma } from '@prisma/client';
import type { AssistantTurnMetadata } from '@/types/assistant/types';

type Db = Pick<Prisma.TransactionClient, 'assistantTurn'>;

export async function writeTurnRow(
  db: Db,
  userId: string,
  conversationId: string | null,
  turn: AssistantTurnMetadata
): Promise<void> {
  await db.assistantTurn.create({
    data: {
      userId,
      conversationId,
      topic: turn.topic,
      outcome: turn.outcome,
      counted: turn.counted,
      steps: turn.steps,
      toolNames: turn.toolNames,
      durationMs: turn.durationMs,
      inputTokens: turn.inputTokens,
      outputTokens: turn.outputTokens,
      costUsd: turn.costUsd,
    },
  });
}
