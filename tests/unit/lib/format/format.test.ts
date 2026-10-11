// T7 (AC-08, AC-09) — lib/format: money, calendar days and moments with a fixed en-US locale,
// independent of the process time zone and of the runtime's default locale.
// T35: every case runs with en-US, uk-UA and de-DE as the default locale, in four process zones.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatDay, formatMoment, formatMoney } from '@/lib/format';
import { DEVICE_LOCALES, RealDateTimeFormat, RealNumberFormat, stubDefaultLocale } from '../../../support/default-locale';

const ORIGINAL_TZ = process.env.TZ;
const ZONES = ['UTC', 'Pacific/Honolulu', 'Pacific/Kiritimati', 'America/New_York'];
const LOCALES = DEVICE_LOCALES;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

describe.each(LOCALES)('the default-locale stub for %s', (locale) => {
  beforeEach(() => stubDefaultLocale(locale));

  // Without this the describe.each below would be vacuous: the stub must change what a locale-less
  // formatter prints, or every locale would just be the machine's own.
  it('makes locale-less money and day formatting print the way that locale does', () => {
    const money = { style: 'currency', currency: 'USD' } as const;
    const day = { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' } as const;
    const stored = new Date('2026-03-01T00:00:00.000Z');
    const realMoney = new RealNumberFormat(locale, money).format(1234.5);
    const realDay = new RealDateTimeFormat(locale, day).format(stored);
    expect(new Intl.NumberFormat(undefined, money).format(1234.5)).toBe(realMoney);
    expect(new Intl.DateTimeFormat(undefined, day).format(stored)).toBe(realDay);
    expect((1234.5).toLocaleString(undefined, money)).toBe(realMoney);
    expect(stored.toLocaleDateString(undefined, day)).toBe(realDay);
    expect(stored.toLocaleString(undefined, day)).toBe(realDay);
    if (locale === 'en-US') {
      expect(realMoney).toBe('$1,234.50');
      expect(realDay).toBe('Mar 1, 2026');
    } else {
      // uk-UA and de-DE write both differently from en-US, so an unpinned locale shows up red.
      expect(realMoney).not.toBe('$1,234.50');
      expect(realDay).not.toBe('Mar 1, 2026');
    }
  });
});

describe.each(LOCALES)('lib/format with a %s default locale', (locale) => {
  describe.each(ZONES)('under process TZ=%s', (tz) => {
    beforeEach(() => {
      process.env.TZ = tz;
      stubDefaultLocale(locale);
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
      it('is the previous day in UTC-10 for a moment shortly after midnight UTC', () => {
        const afterMidnight = new Date('2026-03-02T00:30:00.000Z');
        expect(formatMoment(afterMidnight, 'Pacific/Honolulu')).toBe('Mar 1, 2026');
        expect(formatMoment(afterMidnight, null)).toBe('Mar 2, 2026');
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
});
