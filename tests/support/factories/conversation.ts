// Conversation factory. Messages get positions 0..n. Default title 'Test conversation <n>';
// lastMessageAt defaults to now. Fixture text only, never real data.
// ai-chat-v2 T02: startedFrom (default AI_SECTION), per-message origin (default TYPED on USER, NULL on ASSISTANT)
// and an explicit message id, so a ChoiceOffer can reference its reply.

import type {
  Conversation,
  ConversationMessage,
  ConversationMessageRole,
  ConversationStartPoint,
  MessageOrigin,
  Prisma,
  PrismaClient,
} from '@prisma/client';

export interface ConversationMessageInput {
  role: ConversationMessageRole;
  parts?: Prisma.InputJsonValue;
  text?: string;
  /** Default: TYPED on USER, NULL on ASSISTANT. Pass null for a USER row saved before the backfill. */
  origin?: MessageOrigin | null;
  id?: string;
}

export interface CreateConversationParams {
  userId: string;
  title?: string;
  messages?: ConversationMessageInput[];
  lastMessageAt?: Date;
  startedFrom?: ConversationStartPoint;
}

let counter = 0;

export async function createConversation(
  prisma: PrismaClient,
  params: CreateConversationParams
): Promise<Conversation & { messages: ConversationMessage[] }> {
  counter += 1;
  return prisma.conversation.create({
    data: {
      userId: params.userId,
      title: params.title ?? `Test conversation ${counter}`,
      lastMessageAt: params.lastMessageAt ?? new Date(),
      ...(params.startedFrom ? { startedFrom: params.startedFrom } : {}),
      messages: {
        create: (params.messages ?? []).map((m, position) => ({
          ...(m.id ? { id: m.id } : {}),
          position,
          role: m.role,
          origin: m.origin !== undefined ? m.origin : m.role === 'USER' ? 'TYPED' : null,
          parts: m.parts ?? [{ type: 'text', text: m.text ?? 'Invoice Acme Corp for 20 hours at 50.00 USD' }],
        })),
      },
    },
    include: { messages: true },
  });
}
