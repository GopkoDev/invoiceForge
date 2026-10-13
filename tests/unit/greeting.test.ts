// T37 (ai-chat-v2; AC-18; screens.md §SCR-02 «Greeting»): the empty state's first line by the Freelancer's local time:
// "Good morning" 05:00–11:59, "Good afternoon" 12:00–17:59, "Good evening" otherwise, then ", {first name}" — the
// first word of the account name — or nothing (no comma) when the account has no name.
import { describe, expect, it } from 'vitest';

import { firstName, greetingLine } from '@/lib/helpers/greeting';

// Europe/Kyiv is UTC+3 in October 2026 (summer time until 25 Oct).
const ZONE = 'Europe/Kyiv';
const at = (hhmm: string) => new Date(`2026-10-13T${hhmm}:00.000+03:00`);

describe('greetingLine', () => {
  it.each([
    ['04:59', 'Good evening, Dmytro'],
    ['05:00', 'Good morning, Dmytro'],
    ['11:59', 'Good morning, Dmytro'],
    ['12:00', 'Good afternoon, Dmytro'],
    ['17:59', 'Good afternoon, Dmytro'],
    ['18:00', 'Good evening, Dmytro'],
    ['00:00', 'Good evening, Dmytro'],
  ])('at %s local time says "%s"', (hhmm, expected) => {
    expect(greetingLine('Dmytro Hopko', ZONE, at(hhmm))).toBe(expected);
  });

  it('reads the hour in the Freelancer zone, not UTC', () => {
    // 09:30 UTC is 12:30 in Kyiv and 05:30 in New York.
    const now = new Date('2026-10-13T09:30:00.000Z');
    expect(greetingLine('Ann', 'Europe/Kyiv', now)).toBe('Good afternoon, Ann');
    expect(greetingLine('Ann', 'America/New_York', now)).toBe(
      'Good morning, Ann'
    );
  });

  it.each([null, undefined, '', '   '])(
    'with no name (%j) has no comma',
    (name) => {
      expect(greetingLine(name, ZONE, at('19:00'))).toBe('Good evening');
    }
  );
});

describe('firstName', () => {
  it('is the first word of the account name, trimmed', () => {
    expect(firstName('  Dmytro   Hopko ')).toBe('Dmytro');
    expect(firstName('Cher')).toBe('Cher');
    expect(firstName('')).toBeNull();
    expect(firstName(null)).toBeNull();
  });
});
