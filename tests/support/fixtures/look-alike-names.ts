// ai-chat-v2 (ADR-0004; test-plan.md §Test data): the one shared look-alike fixture set. The fold unit test, the
// three-channel read contract test and the Conversation title-search test all read it, so the spec §6
// "100 % of the look-alike fixture set" NFR is measured once against one source. Fixture names only.

/** Pairs that must fold equal: [as stored, as written]. Cyrillic letters are spelled as \u escapes. */
export const LOOK_ALIKE_PAIRS: ReadonlyArray<readonly [stored: string, written: string, why: string]> = [
  ['Аcme Corp', 'Acme Corp', 'Cyrillic А for Latin A'],
  ['Оohn  Doe', 'oohn doe', 'Cyrillic О, two spaces, lower case (AC-03)'],
  ['Acme Corp', 'ACME CORP', 'case only'],
  ['  Acme   Corp ', 'acme corp', 'leading, trailing and repeated inner spaces'],
  ['Acme\tCorp', 'Acme Corp', 'a tab between words'],
  ['Серс Studio', 'Cepc studio', 'several Cyrillic look-alikes (С, е, р, с) in one word'],
  ['Glоbex Ltd', 'Globex LTD', 'Cyrillic о inside a Latin word, case'],
  ['Привіт Світ', 'привіт  світ', 'a Cyrillic name matches itself in any case'],
  ['Ｉnvoice', 'invoice', 'a full-width letter (NFKC)'],
];

/** Names that must stay distinct from each other after folding. */
export const DISTINCT_NAMES: ReadonlyArray<readonly [string, string]> = [
  ['Acme Corp', 'Acme GmbH'],
  ['John Doe', 'Oohn Doe'],
  ['Acme', 'Acne'],
  ['Globex Ltd', 'Globex Inc'],
];
