// ai-chat-v2 T05 (AC-01, spec §6 "Bank account exposure"; openapi AccountLastFour): the last four characters of
// an account number with spaces removed; fewer when shorter; never padded and never more.
import { describe, expect, it } from 'vitest';
import { accountLastFour } from '@/lib/helpers/account-last-four';

describe('accountLastFour (ai-chat-v2 T05)', () => {
  it('takes the last four characters', () => {
    expect(accountLastFour('26001234564821')).toBe('4821');
  });

  it('removes spaces (any whitespace) before taking the last four', () => {
    expect(accountLastFour('UA21 3223 1300 0002 6007 2335 0 915')).toBe('0915');
    expect(accountLastFour('1234 56\t78')).toBe('5678');
  });

  it('holds what there is when shorter than four, never padded', () => {
    expect(accountLastFour('12')).toBe('12');
    expect(accountLastFour(' 9 ')).toBe('9');
    expect(accountLastFour('')).toBe('');
  });

  it('never returns more than four characters', () => {
    for (const n of ['1', '12345', 'GB82 WEST 1234 5698 7654 32', 'x'.repeat(40)]) {
      expect(accountLastFour(n).length).toBeLessThanOrEqual(4);
    }
  });
});
