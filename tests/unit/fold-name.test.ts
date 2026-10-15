// ai-chat-v2 T03 (ADR-0004; AC-03, AC-17; spec §6 "Look-alike name search"): one isomorphic foldName for the
// resolver, the three reads and the Conversation title search, measured over the shared look-alike fixture set.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { foldName } from '@/lib/helpers/fold-name';
import { DISTINCT_NAMES, LOOK_ALIKE_PAIRS } from '../support/fixtures/look-alike-names';

describe('foldName (ai-chat-v2 T03)', () => {
  it.each(LOOK_ALIKE_PAIRS)('"%s" folds equal to "%s" (%s)', (stored, written) => {
    expect(foldName(stored)).toBe(foldName(written));
  });

  it.each(DISTINCT_NAMES)('"%s" and "%s" stay distinct', (a, b) => {
    expect(foldName(a)).not.toBe(foldName(b));
  });

  it('collapses spaces to one and trims, lower case, look-alikes as Latin', () => {
    expect(foldName(' Оohn\tDoe ')).toBe('oohn doe');
  });

  it('is isomorphic: the helper has no server-only or Node-only import', () => {
    const src = readFileSync(join(process.cwd(), 'lib/helpers/fold-name.ts'), 'utf8');
    expect(src).not.toMatch(/(import|from)\s+['"]server-only['"]/);
    expect(src).not.toMatch(/from\s+['"](node:|fs|path|crypto)/);
    expect(src).not.toMatch(/^import /m);
  });
});
