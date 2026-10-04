// The floor F comes from the optional
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

  // 0 (or any tiny value) would switch the floor off and make a limited
  // response measurably faster than a sent one, so the setting is clamped from below too.
  it.each(['0', '1', '120', '299'])(
    'clamps a configured value below 300 ms up to 300 ms (%s)',
    (value) => {
      expect(responseFloorMs({ SIGNIN_RESPONSE_FLOOR_MS: value })).toBe(300);
    }
  );

  it('keeps 300 ms itself', () => {
    expect(responseFloorMs({ SIGNIN_RESPONSE_FLOOR_MS: '300' })).toBe(300);
  });

  it.each(['abc', '-5', 'NaN', 'Infinity'])(
    'falls back to the default for an unusable value (%s)',
    (value) => {
      expect(responseFloorMs({ SIGNIN_RESPONSE_FLOOR_MS: value })).toBe(1000);
    }
  );
});
