// AssistantTurn factory: metadata only by construction (no text field exists on the model).

import type { AssistantTurn, AssistantTurnOutcome, AssistantTopic, PrismaClient } from '@prisma/client';

export interface CreateAssistantTurnParams {
  userId: string;
  conversationId?: string | null;
  topic?: AssistantTopic | null;
  outcome?: AssistantTurnOutcome;
  counted?: boolean;
  steps?: number;
  toolNames?: string[];
  durationMs?: number;
  inputTokens?: number | null;
  outputTokens?: number | null;
  costUsd?: number | null;
  createdAt?: Date;
}

export async function createAssistantTurn(
  prisma: PrismaClient,
  params: CreateAssistantTurnParams
): Promise<AssistantTurn> {
  return prisma.assistantTurn.create({
    data: {
      userId: params.userId,
      conversationId: params.conversationId ?? null,
      topic: params.topic === undefined ? 'IN_SCOPE' : params.topic,
      outcome: params.outcome ?? 'ANSWERED',
      counted: params.counted ?? true,
      steps: params.steps ?? 1,
      toolNames: params.toolNames ?? [],
      durationMs: params.durationMs ?? 1000,
      inputTokens: params.inputTokens ?? null,
      outputTokens: params.outputTokens ?? null,
      costUsd: params.costUsd ?? null,
      ...(params.createdAt ? { createdAt: params.createdAt } : {}),
    },
  });
}
