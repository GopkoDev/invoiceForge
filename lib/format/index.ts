// T7 (AC-08, AC-09; ADR-0006) — money, calendar days and moments in a fixed en-US locale,
// independent of the runtime's default locale and of the process time zone. Pure and framework-free.

const LOCALE = 'en-US';

const DEFAULT_DATE_STYLE: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };

/** An amount in `currency`, two decimals (e.g. `$1,234.50`). */
export function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** A stored calendar day (UTC midnight), read in UTC so it is never shifted. */
export function formatDay(stored: Date | string, style: Intl.DateTimeFormatOptions = DEFAULT_DATE_STYLE): string {
  return new Intl.DateTimeFormat(LOCALE, { ...style, timeZone: 'UTC' }).format(new Date(stored));
}

/** An instant read in the Freelancer's time zone (UTC when none is saved). */
export function formatMoment(
  instant: Date | string,
  timeZone: string | null,
  style: Intl.DateTimeFormatOptions = DEFAULT_DATE_STYLE,
): string {
  return new Intl.DateTimeFormat(LOCALE, { ...style, timeZone: timeZone ?? 'UTC' }).format(new Date(instant));
}

/** A plain number with grouping and two decimals, no currency (e.g. a total across mixed currencies). */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

/** A percentage rounded to a whole number (e.g. `42%`). */
export function formatPercent(value: number): string {
  return `${new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 }).format(value)}%`;
}
