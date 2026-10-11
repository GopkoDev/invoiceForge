// Conversation factory. Messages get positions 0..n. Default title 'Test conversation <n>';
// lastMessageAt defaults to now. Fixture text only, never real data.

import type { Conversation, ConversationMessage, ConversationMessageRole, Prisma, PrismaClient } from '@prisma/client';

export interface ConversationMessageInput {
  role: ConversationMessageRole;
  parts?: Prisma.InputJsonValue;
  text?: string;
}

export interface CreateConversationParams {
  userId: string;
  title?: string;
  messages?: ConversationMessageInput[];
  lastMessageAt?: Date;
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
      messages: {
        create: (params.messages ?? []).map((m, position) => ({
          position,
          role: m.role,
          parts: m.parts ?? [{ type: 'text', text: m.text ?? 'Invoice Acme Corp for 20 hours at 50.00 USD' }],
        })),
      },
    },
    include: { messages: true },
  });
}
