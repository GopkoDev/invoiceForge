// fix 2026-10-12 (ai-assistant; spec.md §1 "Matching names"): the comparison form of a name. "Ignoring
// case" also ignores what the eye cannot see: stray spaces and Cyrillic letters that look like Latin ones
// ("Оohn Doe " stored with a Cyrillic О matches "Oohn Doe"). Both sides are folded for the comparison only;
// a stored name is never changed and is always shown as stored.
import 'server-only';

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
