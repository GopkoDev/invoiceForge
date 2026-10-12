// fix 2026-10-12 (ai-assistant; spec.md §1 "Matching names"): the comparison form of a name the draft
// resolver matches on. Folding is applied to both sides, so it only ever widens a match across scripts.
import { describe, expect, it } from 'vitest';
import { foldName } from '@/lib/services/assistant-drafts/match-name';

describe('foldName (fix 2026-10-12)', () => {
  it('a Cyrillic look-alike letter and stray spaces fold to the Latin name', () => {
    expect(foldName('Оohn Doe ')).toBe(foldName('Oohn  Doe'));
    expect(foldName(' Оohn\tDoe')).toBe('oohn doe');
  });

  it('a Cyrillic name still matches itself, in any case', () => {
    expect(foldName('Привіт Світ')).toBe(foldName('привіт  світ'));
  });

  it('different names stay different', () => {
    expect(foldName('John Doe')).not.toBe(foldName('Oohn Doe'));
    expect(foldName('Acme')).not.toBe(foldName('Acne'));
  });
});
