// ai-chat-v2 T18 (spec.md §1 "Conversation groups", §5 AC-17; contracts/server-actions.md §listConversationSummaries):
// the Conversation list's groups and title search, run in the browser over listConversationSummaries' rows. Groups
// are by the last message's calendar day in the Freelancer time zone: Today, Yesterday, Previous 7 days (2 to 7
// days before today), Older (8 or more). The search folds the query and the titles with the shared foldName.
// Pure and isomorphic.
import { addDaysToDay, todayInZone } from '@/lib/helpers/calendar-day';
import { foldName } from '@/lib/helpers/fold-name';
import type { ConversationSummary } from '@/types/assistant/types';

export type ConversationGroupKey = 'TODAY' | 'YESTERDAY' | 'PREVIOUS_7_DAYS' | 'OLDER';

export type ConversationGroup<T extends ConversationSummary = ConversationSummary> = {
  key: ConversationGroupKey;
  label: string;
  items: T[];
};

const GROUPS: ReadonlyArray<{ key: ConversationGroupKey; label: string }> = [
  { key: 'TODAY', label: 'Today' },
  { key: 'YESTERDAY', label: 'Yesterday' },
  { key: 'PREVIOUS_7_DAYS', label: 'Previous 7 days' },
  { key: 'OLDER', label: 'Older' },
];

function groupOf(lastDay: string, today: string): ConversationGroupKey {
  if (lastDay >= today) return 'TODAY';
  if (lastDay === addDaysToDay(today, -1)) return 'YESTERDAY';
  if (lastDay >= addDaysToDay(today, -7)) return 'PREVIOUS_7_DAYS';
  return 'OLDER';
}

/** The rows in their groups, in the order given within each group; a group with no rows is left out. */
export function groupConversations<T extends ConversationSummary>(
  items: readonly T[],
  now: Date,
  timeZone: string
): ConversationGroup<T>[] {
  const today = todayInZone(timeZone, now);
  const byKey = new Map<ConversationGroupKey, T[]>();
  for (const item of items) {
    const key = groupOf(todayInZone(timeZone, new Date(item.lastMessageAt)), today);
    byKey.set(key, [...(byKey.get(key) ?? []), item]);
  }
  return GROUPS.filter((g) => byKey.has(g.key)).map((g) => ({ ...g, items: byKey.get(g.key)! }));
}

/** The rows whose title contains the query, ignoring case, extra spaces and look-alike letters; blank → all. */
export function filterByTitle<T extends ConversationSummary>(items: readonly T[], query: string): T[] {
  const folded = foldName(query);
  if (folded === '') return [...items];
  return items.filter((item) => foldName(item.title).includes(folded));
}
