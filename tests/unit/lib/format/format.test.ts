// T7 (AC-08, AC-09) — lib/format: money, calendar days and moments with a fixed en-US locale,
// independent of the process time zone and of the runtime's default locale.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatDay, formatMoment, formatMoney } from '@/lib/format';

const ORIGINAL_TZ = process.env.TZ;
const ZONES = ['UTC', 'Pacific/Honolulu', 'Pacific/Kiritimati', 'America/New_York'];

/** Make every locale-less Intl / toLocale* call behave as `de-DE`, so only an explicit 'en-US' passes. */
function stubDefaultLocale(locale: string) {
  const RealNF = Intl.NumberFormat;
  const RealDTF = Intl.DateTimeFormat;
  const NF = function (l?: string | string[], o?: Intl.NumberFormatOptions) {
    return new RealNF(l ?? locale, o);
  } as unknown as typeof Intl.NumberFormat;
  const DTF = function (l?: string | string[], o?: Intl.DateTimeFormatOptions) {
    return new RealDTF(l ?? locale, o);
  } as unknown as typeof Intl.DateTimeFormat;
  vi.stubGlobal('Intl', { ...Intl, NumberFormat: NF, DateTimeFormat: DTF });
  const dateLocale = Date.prototype.toLocaleDateString;
  const dateTimeLocale = Date.prototype.toLocaleString;
  const numLocale = Number.prototype.toLocaleString;
  vi.spyOn(Date.prototype, 'toLocaleDateString').mockImplementation(function (this: Date, l?: Intl.LocalesArgument, o?: Intl.DateTimeFormatOptions) {
    return dateLocale.call(this, l ?? locale, o);
  });
  vi.spyOn(Date.prototype, 'toLocaleString').mockImplementation(function (this: Date, l?: Intl.LocalesArgument, o?: Intl.DateTimeFormatOptions) {
    return dateTimeLocale.call(this, l ?? locale, o);
  });
  vi.spyOn(Number.prototype, 'toLocaleString').mockImplementation(function (this: number, l?: Intl.LocalesArgument, o?: Intl.NumberFormatOptions) {
    return numLocale.call(this, l ?? locale, o);
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

describe.each(ZONES)('lib/format under process TZ=%s and a de-DE default locale', (tz) => {
  beforeEach(() => {
    process.env.TZ = tz;
    stubDefaultLocale('de-DE');
  });

  describe('formatMoney (AC-09)', () => {
    it('shows US dollars as $1,234.50', () => {
      expect(formatMoney(1234.5, 'USD')).toBe('$1,234.50');
    });
    it('shows hryvnia as UAH 1,234.50 (no symbol, with a non-breaking space as Intl gives)', () => {
      expect(formatMoney(1234.5, 'UAH').replace(/ /g, ' ')).toBe('UAH 1,234.50');
    });
    it('keeps two decimals for zero, negative and large amounts', () => {
      expect(formatMoney(0, 'USD')).toBe('$0.00');
      expect(formatMoney(1000000, 'USD')).toBe('$1,000,000.00');
      expect(formatMoney(-5, 'USD')).toBe('-$5.00');
    });
  });

  describe('formatDay (AC-08): the stored UTC calendar day, never shifted', () => {
    it('reads 2026-03-01T00:00:00Z as Mar 1, 2026 (Date and ISO string)', () => {
      expect(formatDay(new Date('2026-03-01T00:00:00.000Z'))).toBe('Mar 1, 2026');
      expect(formatDay('2026-03-01T00:00:00.000Z')).toBe('Mar 1, 2026');
    });
    it('keeps the day for a stored value late in the UTC day', () => {
      expect(formatDay(new Date('2026-03-01T23:59:59.000Z'))).toBe('Mar 1, 2026');
    });
    it('accepts a style (Intl.DateTimeFormatOptions) and still reads in UTC', () => {
      expect(formatDay('2026-03-01T00:00:00.000Z', { month: 'long', day: 'numeric', year: 'numeric' })).toBe(
        'March 1, 2026',
      );
      expect(formatDay('2026-03-01T00:00:00.000Z', { month: 'short', day: 'numeric' })).toBe('Mar 1');
    });
  });

  describe('formatMoment (AC-08): the day in the Freelancer time zone, UTC when null', () => {
    const instant = new Date('2026-03-01T23:30:00.000Z');
    it('is the next day in UTC+14', () => {
      expect(formatMoment(instant, 'Pacific/Kiritimati')).toBe('Mar 2, 2026');
    });
    it('is the same day in UTC-10', () => {
      expect(formatMoment(instant, 'Pacific/Honolulu')).toBe('Mar 1, 2026');
    });
    it('uses UTC when no time zone is saved (null)', () => {
      expect(formatMoment(instant, null)).toBe('Mar 1, 2026');
    });
    it('accepts an ISO string and a style', () => {
      expect(formatMoment('2026-03-01T23:30:00.000Z', 'Pacific/Kiritimati', { month: 'short', day: 'numeric' })).toBe(
        'Mar 2',
      );
    });
  });
});
