// T42 (spec.md §5 AC-22, AC-23; review-2026-10-05-r2 H-08) — a named preset in the link is
// resolved on the server in the account zone, so a tab left open past midnight never sends a stale
// month.
import { describe, expect, it } from 'vitest';
import { dashboardParamsSchema } from '@/lib/validations/search-params';

// 2026-10-31 20:00 UTC: 31 Oct in Los Angeles, 1 Nov in Auckland.
const NOW = new Date('2026-10-31T20:00:00Z');

describe('dashboardParamsSchema preset=<name> (T42, AC-22/AC-23)', () => {
  it.each([
    ['this-month', '2026-11-01', '2026-11-30'],
    ['last-month', '2026-10-01', '2026-10-31'],
    ['next-month', '2026-12-01', '2026-12-31'],
    ['this-year', '2026-01-01', '2026-12-31'],
    ['last-year', '2025-01-01', '2025-12-31'],
  ])('preset=%s resolves in the account zone to %s..%s', (preset, from, to) => {
    const parsed = dashboardParamsSchema('Pacific/Auckland', NOW).parse({ preset });
    expect(parsed.period).toEqual({ from, to });
  });

  it('the same instant in Los Angeles resolves this-month to October', () => {
    const parsed = dashboardParamsSchema('America/Los_Angeles', NOW).parse({
      preset: 'this-month',
    });
    expect(parsed.period).toEqual({ from: '2026-10-01', to: '2026-10-31' });
  });

  it('a preset wins over a stale from/to pair', () => {
    const parsed = dashboardParamsSchema('Pacific/Auckland', NOW).parse({
      preset: 'last-month',
      from: '2020-01-01',
      to: '2020-01-31',
    });
    expect(parsed.period).toEqual({ from: '2026-10-01', to: '2026-10-31' });
  });
});
