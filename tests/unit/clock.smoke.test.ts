import { describe, expect, it } from 'vitest';
import { createFixedClock } from '../support/clock';

describe('createFixedClock (unit smoke)', () => {
  it('stays fixed until advanced', () => {
    const clock = createFixedClock(new Date('2026-01-01T00:00:00.000Z'));

    expect(clock.now().toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(clock.now().toISOString()).toBe('2026-01-01T00:00:00.000Z');

    clock.advance(60_000);
    expect(clock.now().toISOString()).toBe('2026-01-01T00:01:00.000Z');

    clock.set(new Date('2027-06-15T12:00:00.000Z'));
    expect(clock.now().toISOString()).toBe('2027-06-15T12:00:00.000Z');
  });
});
