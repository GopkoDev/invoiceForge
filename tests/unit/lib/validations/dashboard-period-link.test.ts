// AC-07, AC-08, AC-09: the dashboard link reader applies the shared five-year rule.
import { describe, expect, it } from 'vitest';
import { dashboardParamsSchema } from '@/lib/validations/search-params';
import { currentLocalMonth } from '@/lib/helpers/time-zone';

describe('link reader applies the same boundary (AC-07, AC-08, AC-09)', () => {
  const TZ = 'Europe/Kyiv';
  const NOW = new Date('2026-09-27T12:00:00.000Z');
  const [monthStart, monthEnd] = currentLocalMonth(TZ, NOW);
  const parse = (params: Record<string, string>) =>
    dashboardParamsSchema(TZ, NOW).parse(params);

  it('applies exactly five years', () => {
    expect(parse({ from: '2021-01-01', to: '2026-01-01' }).period).toEqual({
      from: '2021-01-01',
      to: '2026-01-01',
    });
  });

  it.each([
    ['five years and one day', { from: '2021-01-01', to: '2026-01-02' }],
    ['absurd range', { from: '0100-01-01', to: '9999-12-31' }],
    ['malformed', { from: 'abc', to: 'xyz' }],
  ])(
    '%s falls back to the current month, the same as a malformed link',
    (_n, params) => {
      const r = parse(params);
      expect(r.appliedRange).toEqual({
        start: monthStart,
        endExclusive: monthEnd,
      });
      expect(r).toEqual(parse({ from: 'abc', to: 'xyz' }));
    }
  );

  it('preset=all-time is never capped', () => {
    expect(
      parse({ preset: 'all-time', from: '2000-01-01', to: '2026-01-01' })
    ).toEqual({
      appliedRange: undefined,
      period: undefined,
    });
  });
});
