// T26 (review F-21; sad.md §6 response floor): the floor F comes from the optional
// SIGNIN_RESPONSE_FLOOR_MS setting (the p90 send time measured on preview), defaults to 1000 ms
// and is clamped to at most 1200 ms so the sign-in p95 stays within 1.5 s.
import { describe, expect, it } from 'vitest';
import { responseFloorMs } from '@/lib/auth/email-provider';

describe('responseFloorMs', () => {
  it('defaults to 1000 ms when the setting is unset or empty', () => {
    expect(responseFloorMs({})).toBe(1000);
    expect(responseFloorMs({ SIGNIN_RESPONSE_FLOOR_MS: '' })).toBe(1000);
  });

  it('uses the configured value', () => {
    expect(responseFloorMs({ SIGNIN_RESPONSE_FLOOR_MS: '750' })).toBe(750);
    expect(responseFloorMs({ SIGNIN_RESPONSE_FLOOR_MS: '1200' })).toBe(1200);
  });

  it('clamps a configured value above 1200 ms to 1200 ms', () => {
    expect(responseFloorMs({ SIGNIN_RESPONSE_FLOOR_MS: '5000' })).toBe(1200);
  });

  it.each(['abc', '-5', 'NaN', 'Infinity'])(
    'falls back to the default for an unusable value (%s)',
    (value) => {
      expect(responseFloorMs({ SIGNIN_RESPONSE_FLOOR_MS: value })).toBe(1000);
    }
  );
});
