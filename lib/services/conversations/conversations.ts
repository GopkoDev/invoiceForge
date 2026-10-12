// T10 (ai-assistant; spec.md §5 AC-35, AC-36, AC-41; ADR-0008): Conversations are listed and opened
// owner-scoped. Opening writes nothing; every linked invoice is read in its current state.
import 'server-only';
import { z } from 'zod';
import { prisma } from '@/prisma';
import { ok, fail, type ActionResult } from '@/types/result';
import type { ActingFreelancer } from '@/lib/services/_shared/acting-freelancer';
import { paginate, type Page } from '@/lib/services/_shared/list-query';
import { failed } from '@/lib/services/_shared/result-helpers';
import { derivedStatus, todayIn } from '@/lib/services/_shared/overdue';
import { appLinkSchema } from '@/lib/validations/assistant-chat';
import { toDraftCardView } from '@/lib/services/assistant-drafts/card-view';
import type {
  ConversationMessageView,
  ConversationSummary,
  DraftCardView,
  LinkedInvoiceState,
} from '@/types/assistant/types';

const PAGE_SIZE = 20;
const HISTORY_LIMIT = 40;
const NOT_FOUND_MESSAGE = "This conversation can't be found.";
const FAILED_MESSAGE = "We couldn't load this conversation. Please try again.";

const partSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string() }).strict(),
  z.object({ type: z.literal('data-link'), data: appLinkSchema }).strict(),
  z
    .object({ type: z.literal('data-draft-card'), id: z.string(), data: z.object({ cardId: z.string() }).strict() })
    .strict(),
]);
const partsSchema = z.array(partSchema);

type MessageRow = { id: string; role: 'USER' | 'ASSISTANT'; parts: unknown; createdAt: Date };

const toSummary = (c: { id: string; title: string; lastMessageAt: Date }): ConversationSummary => ({
  id: c.id,
  title: c.title,
  lastMessageAt: c.lastMessageAt.toISOString(),
});

const toMessageView = (m: MessageRow): ConversationMessageView => ({
  id: m.id,
  role: m.role === 'USER' ? 'user' : 'assistant',
  parts: partsSchema.parse(m.parts),
  createdAt: m.createdAt.toISOString(),
});

export async function listConversations(
  actor: ActingFreelancer,
  page?: number
): Promise<ActionResult<Page<ConversationSummary>>> {
  const where = { userId: actor.userId };
  try {
    const result = await paginate({
      count: () => prisma.conversation.count({ where }),
      findMany: (args) =>
        prisma.conversation.findMany({
          where,
          select: { id: true, title: true, lastMessageAt: true },
          ...args,
        } as Parameters<typeof prisma.conversation.findMany>[0]) as Promise<
          Array<{ id: string; title: string; lastMessageAt: Date }>
        >,
      orderBy: [{ lastMessageAt: 'desc' }],
      query: { page, pageSize: PAGE_SIZE },
    });
    return ok({ ...result, items: result.items.map(toSummary) });
  } catch (error) {
    return failed('listConversations failed', error, "We couldn't load your conversations. Please try again.");
  }
}

export async function readInvoiceStates(
  actor: ActingFreelancer,
  ids: string[]
): Promise<Record<string, LinkedInvoiceState>> {
  const states: Record<string, LinkedInvoiceState> = {};
  if (ids.length === 0) return states;
  const rows = await prisma.invoice.findMany({
    where: { id: { in: ids }, senderProfile: { userId: actor.userId } },
    select: { id: true, invoiceNumber: true, status: true, dueDate: true },
  });
  const today = todayIn(actor.timeZone);
  for (const r of rows) {
    states[r.id] =
      r.status === 'DRAFT'
        ? { state: 'DRAFT', invoiceId: r.id, invoiceNumber: r.invoiceNumber }
        : {
            state: 'ISSUED',
            invoiceId: r.id,
            invoiceNumber: r.invoiceNumber,
            status: derivedStatus(r, today),
          };
  }
  for (const id of ids) states[id] ??= { state: 'UNAVAILABLE' };
  return states;
}

export async function getConversation(
  actor: ActingFreelancer,
  id: string
): Promise<
  ActionResult<{
    conversation: ConversationSummary;
    messages: ConversationMessageView[];
    cards: Record<string, DraftCardView>;
    invoiceLinks: Record<string, LinkedInvoiceState>;
  }>
> {
  try {
    const conversation = await prisma.conversation.findFirst({
      where: { id, userId: actor.userId },
      select: {
        id: true,
        title: true,
        lastMessageAt: true,
        messages: {
          orderBy: { position: 'asc' },
          select: { id: true, role: true, parts: true, createdAt: true },
        },
      },
    });
    if (!conversation) return fail('NOT_FOUND', NOT_FOUND_MESSAGE);

    const messages = conversation.messages.map(toMessageView);
    const cardIds = new Set<string>();
    const invoiceIds = new Set<string>();
    for (const m of messages) {
      for (const p of m.parts) {
        if (p.type === 'data-draft-card') cardIds.add(p.data.cardId);
        else if (p.type === 'data-link' && p.data.kind === 'invoice') invoiceIds.add(p.data.invoiceId);
      }
    }

    const cardSelect = { id: true, state: true, proposal: true, replacedById: true, invoiceId: true } as const;
    const cardRows =
      cardIds.size === 0
        ? []
        : await prisma.draftCard.findMany({
            where: { id: { in: [...cardIds] }, userId: actor.userId },
            select: cardSelect,
          });
    // An OUTDATED card's successor never got a part of its own: follow the chain, owner-scoped.
    const seen = new Set(cardRows.map((c) => c.id));
    let frontier = cardRows;
    while (frontier.length > 0) {
      const wanted = [
        ...new Set(
          frontier
            .filter((c) => c.state === 'OUTDATED' && c.replacedById && !seen.has(c.replacedById))
            .map((c) => c.replacedById as string)
        ),
      ];
      if (wanted.length === 0) break;
      frontier = await prisma.draftCard.findMany({
        where: { id: { in: wanted }, userId: actor.userId },
        select: cardSelect,
      });
      for (const c of frontier) {
        seen.add(c.id);
        cardRows.push(c);
      }
    }
    for (const c of cardRows) if (c.invoiceId) invoiceIds.add(c.invoiceId);

    const invoiceLinks = await readInvoiceStates(actor, [...invoiceIds]);
    const cards: Record<string, DraftCardView> = {};
    for (const c of cardRows) cards[c.id] = toDraftCardView(c, invoiceLinks);

    return ok({ conversation: toSummary(conversation), messages, cards, invoiceLinks });
  } catch (error) {
    return failed('getConversation failed', error, FAILED_MESSAGE);
  }
}

/** The latest 40 messages of an owned Conversation, oldest first (for the chat route). */
export async function loadHistory(
  actor: ActingFreelancer,
  conversationId: string
): Promise<ActionResult<ConversationMessageView[]>> {
  try {
    const owned = await prisma.conversation.findFirst({
      where: { id: conversationId, userId: actor.userId },
      select: { id: true },
    });
    if (!owned) return fail('NOT_FOUND', NOT_FOUND_MESSAGE);
    const rows = await prisma.conversationMessage.findMany({
      where: { conversationId },
      orderBy: { position: 'desc' },
      take: HISTORY_LIMIT,
      select: { id: true, role: true, parts: true, createdAt: true },
    });
    return ok(rows.reverse().map(toMessageView));
  } catch (error) {
    return failed('loadHistory failed', error, FAILED_MESSAGE);
  }
}
