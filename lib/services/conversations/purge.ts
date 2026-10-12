// T14 (ai-assistant; spec.md §5 AC-38): the daily 90-day sweep of Conversations. Messages and Draft cards
// go with their Conversation (cascade); Assistant turns stay, unlinked (SetNull), until their own 400-day window.
import 'server-only';
import { prisma } from '@/prisma';

const DAY_MS = 24 * 60 * 60 * 1000;
export const CONVERSATION_RETENTION_DAYS = 90;

/** Deletes Conversations whose last message is older than 90 days; returns how many went. */
export async function purgeConversationsOlderThan90Days(now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - CONVERSATION_RETENTION_DAYS * DAY_MS);
  const { count } = await prisma.conversation.deleteMany({ where: { lastMessageAt: { lt: cutoff } } });
  return count;
}
