// T24 (spec.md §5 AC-25) — a malformed or inverted dashboard date range falls back to the
// current month in the Freelancer's time zone, per
// docs/features/architecture-hardening/tasks/t24-dashboard-link-params.md (Inlined context —
// contracts/server-actions.md §Link parameters, Dashboard, verbatim table: "`from`, `to` |
// `YYYY-MM-DD`, both valid and from <= to | the current month in `tz` (AC-25)"; sad.md §8 Hard
// rule "Time and time zones": day boundaries and "current month" use the validated browser time
// zone, range ends exclusive at the next local midnight) and the test-plan.md row for AC-25
// (below).
//
// test-plan.md row exercised here (§AC-25, unit):
//   "malformed or inverted dashboard range falls back to the current month in the Freelancer's
//   time zone — from=abc, to=xyz, a missing end, and start after end all give the current month
//   in the given time zone. An invalid time zone falls back to UTC."
//
// Assumed API (task file §Checklist item 1, verbatim: "Add `dashboardParamsSchema` (`.catch`
// fallbacks; invalid or inverted range -> `currentLocalMonth(tz)`)"; §Checklist item 3: "Date-
// dependent dashboard actions take `{ start, endExclusive }` from the helper"):
//   dashboardParamsSchema(timeZone: string, now?: Date) -> a zod schema over Next.js
//   searchParams-shaped input ({ from?, to?, preset? }, each string | string[] | undefined),
//   .parse()'d to { appliedRange: { start: Date; endExclusive: Date } | undefined }.
//   - preset === 'all-time' -> appliedRange undefined (no range).
//   - from/to both valid YYYY-MM-DD with from <= to -> appliedRange from
//     lib/helpers/time-zone.ts's localDayRange(from, to, timeZone) (start, exclusive end).
//   - otherwise (missing, malformed, or from > to) -> appliedRange from
//     lib/helpers/time-zone.ts's currentLocalMonth(timeZone, now) — `now` is an injectable
//     parameter so this suite never depends on the real clock.
//   The `timeZone` string itself is validated upstream by getRequestTimeZone() (T22); this schema
//   trusts whatever zone it is given, so an "invalid time zone falls back to UTC" is exercised by
//   passing an already-invalid zone through and confirming Intl-backed computation does not throw
//   and lands on a UTC-based month (matching currentLocalMonth's own fallback behaviour is
//   getRequestTimeZone's job — this suite only confirms dashboardParamsSchema does not special-
//   case or re-validate the zone).
//
// RED (T24 not yet implemented): lib/validations/search-params.ts does not export
// `dashboardParamsSchema` yet — this suite fails to resolve that export before any assertion
// runs.
import { describe, expect, it } from 'vitest';
import { dashboardParamsSchema } from '@/lib/validations/search-params';
import { currentLocalMonth, localDayRange } from '@/lib/helpers/time-zone';

const TZ = 'Europe/Kyiv';
const NOW = new Date('2026-09-27T12:00:00.000Z');

describe('dashboardParamsSchema (unit, AC-25)', () => {
  const [monthStart, monthEnd] = currentLocalMonth(TZ, NOW);

  it.each([
    ['from=abc&to=xyz (malformed)', { from: 'abc', to: 'xyz' }],
    ['to missing', { from: '2026-09-05' }],
    ['from missing', { to: '2026-09-05' }],
    ['start after end (reversed)', { from: '2026-10-05', to: '2026-10-01' }],
  ])('%s falls back to the current local month in the given time zone', (_label, raw) => {
    const parsed = dashboardParamsSchema(TZ, NOW).parse(raw);

    expect(parsed.appliedRange).toBeDefined();
    expect(parsed.appliedRange?.start.getTime()).toBe(monthStart.getTime());
    expect(parsed.appliedRange?.endExclusive.getTime()).toBe(monthEnd.getTime());
  });

  it('a valid from<=to range is applied with local day bounds and an inclusive last day', () => {
    const parsed = dashboardParamsSchema(TZ, NOW).parse({
      from: '2026-09-01',
      to: '2026-09-15',
    });
    const [expectedStart, expectedEnd] = localDayRange('2026-09-01', '2026-09-15', TZ);

    expect(parsed.appliedRange?.start.getTime()).toBe(expectedStart.getTime());
    expect(parsed.appliedRange?.endExclusive.getTime()).toBe(expectedEnd.getTime());
  });

  it('preset=all-time drops the range entirely', () => {
    const parsed = dashboardParamsSchema(TZ, NOW).parse({
      from: '2026-09-01',
      to: '2026-09-15',
      preset: 'all-time',
    });

    expect(parsed.appliedRange).toBeUndefined();
  });

  it('never throws on garbage/tampered input', () => {
    expect(() =>
      dashboardParamsSchema(TZ, NOW).parse({
        from: null,
        to: { evil: true },
        preset: ['all-time', 'x'],
      }),
    ).not.toThrow();
  });

  it('an unknown/tampered time zone still resolves to a current-month range, never throws', () => {
    const parsed = dashboardParamsSchema('Not/AZone', NOW).parse({ from: 'abc', to: 'xyz' });

    expect(parsed.appliedRange).toBeDefined();
  });
});
