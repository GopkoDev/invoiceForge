// ai-chat-v2 T18 (spec.md §1 "Conversation groups", §5 AC-17; contracts/server-actions.md §listConversationSummaries):
// the Conversation list is grouped by the last message's local day in the Freelancer time zone and searched by a
// folded title. Pure: a fixed clock and zone, no database.
import { describe, expect, it } from 'vitest';
import { filterByTitle, groupConversations } from '@/lib/helpers/conversation-groups';
import { LOOK_ALIKE_PAIRS, DISTINCT_NAMES } from '../support/fixtures/look-alike-names';

const row = (id: string, lastMessageAt: string, title = `Conversation ${id}`) => ({ id, title, lastMessageAt });
const shape = (groups: ReturnType<typeof groupConversations>) =>
  groups.map((g) => [g.key, g.label, g.items.map((i) => i.id)] as const);

describe('groupConversations (AC-17)', () => {
  const now = new Date('2026-10-13T12:00:00Z');

  it('puts today, yesterday, 7 days ago and 8 days ago into Today, Yesterday, Previous 7 days and Older', () => {
    const items = [
      row('today', '2026-10-13T09:00:00Z'),
      row('yesterday', '2026-10-12T09:00:00Z'),
      row('two', '2026-10-11T09:00:00Z'),
      row('seven', '2026-10-06T09:00:00Z'),
      row('eight', '2026-10-05T09:00:00Z'),
      row('old', '2025-01-01T09:00:00Z'),
    ];
    expect(shape(groupConversations(items, now, 'UTC'))).toEqual([
      ['TODAY', 'Today', ['today']],
      ['YESTERDAY', 'Yesterday', ['yesterday']],
      ['PREVIOUS_7_DAYS', 'Previous 7 days', ['two', 'seven']],
      ['OLDER', 'Older', ['eight', 'old']],
    ]);
  });

  it('keeps the order it was given within a group (newest first from the service)', () => {
    const items = [row('b', '2026-10-13T11:00:00Z'), row('a', '2026-10-13T01:00:00Z')];
    expect(shape(groupConversations(items, now, 'UTC'))).toEqual([['TODAY', 'Today', ['b', 'a']]]);
  });

  it('omits a group with no rows; no rows gives no groups', () => {
    expect(shape(groupConversations([row('old', '2026-01-01T00:00:00Z')], now, 'UTC'))).toEqual([
      ['OLDER', 'Older', ['old']],
    ]);
    expect(groupConversations([], now, 'UTC')).toEqual([]);
  });

  it('uses the Freelancer time zone, not UTC: 23:30 UTC is already tomorrow in Kyiv', () => {
    const kyivNow = new Date('2026-10-13T08:00:00Z'); // 11:00 in Kyiv
    const items = [row('late', '2026-10-12T22:30:00Z'), row('earlier', '2026-10-12T20:30:00Z')];
    // 2026-10-12T22:30Z is 01:30 on the 13th in Kyiv (UTC+3); 20:30Z is 23:30 on the 12th.
    expect(shape(groupConversations(items, kyivNow, 'Europe/Kyiv'))).toEqual([
      ['TODAY', 'Today', ['late']],
      ['YESTERDAY', 'Yesterday', ['earlier']],
    ]);
  });

  it('a message exactly at local midnight belongs to that local day', () => {
    // 2026-10-13T00:00 in New York (UTC-4) = 04:00Z.
    const nyNow = new Date('2026-10-13T16:00:00Z');
    const items = [row('midnight', '2026-10-13T04:00:00Z'), row('just-before', '2026-10-13T03:59:59Z')];
    expect(shape(groupConversations(items, nyNow, 'America/New_York'))).toEqual([
      ['TODAY', 'Today', ['midnight']],
      ['YESTERDAY', 'Yesterday', ['just-before']],
    ]);
  });

  it('counts calendar days across a DST change (a 23-hour day does not shift a group)', () => {
    // Europe/Kyiv leaves summer time on 2026-10-25 at 04:00 local.
    const afterDst = new Date('2026-10-26T10:00:00Z'); // 12:00 local on the 26th
    const items = [
      row('yesterday', '2026-10-24T22:30:00Z'), // 01:30 local on the 25th (still UTC+3)
      row('two-days', '2026-10-24T20:00:00Z'), // 23:00 local on the 24th
    ];
    expect(shape(groupConversations(items, afterDst, 'Europe/Kyiv'))).toEqual([
      ['YESTERDAY', 'Yesterday', ['yesterday']],
      ['PREVIOUS_7_DAYS', 'Previous 7 days', ['two-days']],
    ]);
  });
});

describe('filterByTitle (AC-17)', () => {
  const items = [
    row('1', '2026-10-13T09:00:00Z', 'Invoice for Acme'),
    row('2', '2026-10-13T09:00:00Z', 'Globex draft'),
    row('3', '2026-10-13T09:00:00Z', 'Мy INVOICES'),
  ];

  it('an empty or blank query returns every row', () => {
    expect(filterByTitle(items, '')).toEqual(items);
    expect(filterByTitle(items, '   ')).toEqual(items);
  });

  it('matches "inv" ignoring case', () => {
    expect(filterByTitle(items, 'inv').map((i) => i.id)).toEqual(['1', '3']);
    expect(filterByTitle(items, 'INV').map((i) => i.id)).toEqual(['1', '3']);
  });

  it('ignores extra spaces in the query and the titles', () => {
    expect(filterByTitle([row('x', '2026-10-13T09:00:00Z', 'Invoice   for  Acme')], '  invoice for ').map((i) => i.id)).toEqual(['x']);
  });

  it('returns [] when nothing matches', () => {
    expect(filterByTitle(items, 'zzz')).toEqual([]);
  });

  it.each(LOOK_ALIKE_PAIRS)('the shared look-alike fixture: title %j is found by %j (%s)', (stored, written) => {
    expect(filterByTitle([row('t', '2026-10-13T09:00:00Z', stored)], written)).toHaveLength(1);
  });

  it.each(DISTINCT_NAMES)('distinct names stay distinct: %j is not found by %j', (a, b) => {
    expect(filterByTitle([row('t', '2026-10-13T09:00:00Z', a)], b)).toEqual([]);
  });
});
