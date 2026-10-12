// ai-chat-v2 T03 (ADR-0004; moved from lib/services/assistant-drafts/match-name.ts, fix 2026-10-12): the comparison
// form of a name, shared by the draft resolver, the three read questions and the Conversation title search.
// "Ignoring case" also ignores what the eye cannot see: stray spaces and Cyrillic letters that look like Latin ones
// ("Оohn Doe " stored with a Cyrillic О matches "Oohn Doe"). Both sides are folded for the comparison only; a
// stored name is never changed and is always shown as stored. Isomorphic: no server-only, no Node-only API.

// Cyrillic letters (after lower-casing) that look like a Latin letter in print, upper or lower case.
const LOOK_ALIKE: Record<string, string> = {
  а: 'a',
  в: 'b',
  е: 'e',
  і: 'i',
  ј: 'j',
  к: 'k',
  м: 'm',
  н: 'h',
  о: 'o',
  р: 'p',
  с: 'c',
  ѕ: 's',
  т: 't',
  у: 'y',
  х: 'x',
};

/** The name as compared: Unicode-normalized, lower case, look-alike letters as Latin, spaces collapsed. */
export function foldName(name: string): string {
  return name
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[а-яіјѕ]/g, (c) => LOOK_ALIKE[c] ?? c)
    .replace(/\s+/g, ' ')
    .trim();
}
