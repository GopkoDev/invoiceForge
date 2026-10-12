// T25 (ai-assistant; spec.md §5 AC-35; sad.md §6): one exchange is saved in one transaction under the Conversation
// row lock - the Conversation (when new), both messages, the proposed card and the turn metadata.
import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/prisma';
import { ok, fail, type ActionResult } from '@/types/result';
import type { ActingFreelancer } from '@/lib/services/_shared/acting-freelancer';
import { failed } from '@/lib/services/_shared/result-helpers';
import { insertLiveCard } from '@/lib/services/assistant-drafts/cards';
import { writeTurnRow } from '@/lib/services/assistant-usage/turn-row';
import type { AssistantTurnMetadata, ConversationMessageView } from '@/types/assistant/types';

const NOT_FOUND_MESSAGE = "This conversation can't be found.";
const TITLE_LENGTH = 80;

export type SaveTurnInput = {
  conversation: { id: string; isNew: boolean };
  userText: string;
  assistantParts: ConversationMessageView['parts'];
  turn: AssistantTurnMetadata;
  proposedCard?: { id: string; request: unknown; proposal: unknown };
};

export async function saveTurn(
  actor: ActingFreelancer,
  input: SaveTurnInput
): Promise<ActionResult<{ conversationId: string; title: string }>> {
  const { conversation, userText, assistantParts, turn, proposedCard } = input;
  try {
    return await prisma.$transaction(async (tx) => {
      let title: string;
      let nextPosition = 0;
      if (conversation.isNew) {
        title = userText.trim().slice(0, TITLE_LENGTH).trim();
        await tx.conversation.create({ data: { id: conversation.id, userId: actor.userId, title, lastMessageAt: new Date() } });
      } else {
        const locked = await tx.$queryRaw<{ title: string }[]>`
          SELECT "title" FROM "Conversation" WHERE id = ${conversation.id} AND "userId" = ${actor.userId} FOR UPDATE`;
        if (locked.length === 0) {
          await writeTurnRow(tx, actor.userId, null, turn);
          return fail('NOT_FOUND', NOT_FOUND_MESSAGE);
        }
        title = locked[0].title;
        const last = await tx.conversationMessage.aggregate({
          where: { conversationId: conversation.id },
          _max: { position: true },
        });
        nextPosition = (last._max.position ?? -1) + 1;
      }

      await tx.conversationMessage.createMany({
        data: [
          {
            conversationId: conversation.id,
            position: nextPosition,
            role: 'USER',
            parts: [{ type: 'text', text: userText }] as Prisma.InputJsonValue,
          },
          {
            conversationId: conversation.id,
            position: nextPosition + 1,
            role: 'ASSISTANT',
            parts: assistantParts as Prisma.InputJsonValue,
          },
        ],
      });
      if (proposedCard) {
        await insertLiveCard(tx, {
          userId: actor.userId,
          conversationId: conversation.id,
          id: proposedCard.id,
          request: proposedCard.request,
          proposal: proposedCard.proposal,
        });
      }
      await writeTurnRow(tx, actor.userId, conversation.id, turn);
      await tx.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date() } });
      return ok({ conversationId: conversation.id, title });
    });
  } catch (error) {
    return failed('saveTurn failed', error, "We couldn't save this conversation. Please try again.");
  }
}
