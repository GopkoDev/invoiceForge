// T25 (ai-assistant; spec.md §5 AC-35; sad.md §6): one exchange is saved in one transaction under the Conversation
// row lock - the Conversation (when new), both messages, the proposed card and the turn metadata.
// ai-chat-v2 T11 (server-actions.md §saveTurn; AC-12, AC-13, AC-18): the Conversation is created with its start
// point; a typed or dashboard message closes the open offer before the turn's own offer is stored OPEN, tied to the
// pre-generated reply id; the USER row carries its origin, the reply none.
import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/prisma';
import { ok, fail, type ActionResult } from '@/types/result';
import type { ActingFreelancer } from '@/lib/services/_shared/acting-freelancer';
import { failed } from '@/lib/services/_shared/result-helpers';
import { insertLiveCard } from '@/lib/services/assistant-drafts/cards';
import { writeTurnRow } from '@/lib/services/assistant-usage/turn-row';
import { storedOfferOptionsSchema, type PendingOffer } from '@/lib/services/assistant-drafts/offers';
import type {
  AssistantTurnMetadata,
  ConversationMessageView,
  ConversationStartPoint,
  MessageOrigin,
} from '@/types/assistant/types';

const NOT_FOUND_MESSAGE = "This conversation can't be found.";
const TITLE_LENGTH = 80;

export type SaveTurnInput = {
  conversation: { id: string; isNew: boolean };
  /** Only on a new Conversation; the column defaults to AI_SECTION. */
  startedFrom?: ConversationStartPoint;
  userText: string;
  userOrigin: MessageOrigin;
  /** The reply's pre-generated id, so the offer can reference it. */
  assistantMessageId: string;
  assistantParts: ConversationMessageView['parts'];
  offer: PendingOffer | null;
  turn: AssistantTurnMetadata;
  proposedCard?: { id: string; request: unknown; proposal: unknown };
};

export async function saveTurn(
  actor: ActingFreelancer,
  input: SaveTurnInput
): Promise<ActionResult<{ conversationId: string; title: string }>> {
  const { conversation, userText, assistantParts, turn, proposedCard, offer } = input;
  try {
    // Options are built in code (ADR-0002); anything else is a bug, and nothing of the turn is saved.
    const options = offer ? storedOfferOptionsSchema.parse(offer.options) : null;
    return await prisma.$transaction(async (tx) => {
      let title: string;
      let nextPosition = 0;
      if (conversation.isNew) {
        title = userText.trim().slice(0, TITLE_LENGTH).trim();
        await tx.conversation.create({
          data: {
            id: conversation.id,
            userId: actor.userId,
            title,
            lastMessageAt: new Date(),
            ...(input.startedFrom ? { startedFrom: input.startedFrom } : {}),
          },
        });
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

      // A press keeps the offer it claimed; any other message makes the earlier buttons inactive (AC-12).
      if (input.userOrigin !== 'PRESSED') {
        await tx.choiceOffer.updateMany({
          where: { conversationId: conversation.id, state: 'OPEN' },
          data: { state: 'CLOSED', chosenOptionId: null },
        });
      }
      await tx.conversationMessage.createMany({
        data: [
          {
            conversationId: conversation.id,
            position: nextPosition,
            role: 'USER',
            origin: input.userOrigin,
            parts: [{ type: 'text', text: userText }] as Prisma.InputJsonValue,
          },
          {
            ...(input.assistantMessageId ? { id: input.assistantMessageId } : {}),
            conversationId: conversation.id,
            position: nextPosition + 1,
            role: 'ASSISTANT',
            parts: assistantParts as Prisma.InputJsonValue,
          },
        ],
      });
      if (offer && options) {
        await tx.choiceOffer.create({
          data: {
            id: offer.id,
            userId: actor.userId,
            conversationId: conversation.id,
            messageId: input.assistantMessageId,
            kind: offer.kind,
            lineIndex: offer.lineIndex,
            request: offer.request as Prisma.InputJsonValue,
            options: options as Prisma.InputJsonValue,
            state: 'OPEN',
          },
        });
      }
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
