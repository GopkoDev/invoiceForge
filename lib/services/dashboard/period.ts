import 'server-only';
import { z } from 'zod';
import { Currency } from '@prisma/client';
import { fail, type ActionFailure } from '@/types/result';
import {
  PERIOD_TOO_LONG,
  isWithinMaxCustomPeriod,
} from '@/lib/validations/dashboard-period';
import { utcDayRange } from '@/lib/helpers/calendar-day';

/** Inclusive local calendar dates (YYYY-MM-DD), read in the actor's time zone. */
export type LocalDate = string;
export type DashboardPeriod = { from: LocalDate; to: LocalDate };

export const PERIOD_MESSAGE =
  'Give both dates as YYYY-MM-DD, with the start on or before the end.';
export const CURRENCY_MESSAGE = 'Unknown currency.';

const isRealLocalDate = (value: unknown): value is LocalDate => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
};

const periodSchema = z
  .object({
    from: z.custom<LocalDate>(isRealLocalDate),
    to: z.custom<LocalDate>(isRealLocalDate),
  })
  .refine((p) => p.from <= p.to);

const currencySchema = z.nativeEnum(Currency);

export type ParsedDashboardInput = {
  success: true;
  currency: Currency;
  period?: DashboardPeriod;
};

/** Validates currency and the optional period; one message per field, no query runs on failure. */
export function parseDashboardInput(
  currency: unknown,
  period: unknown
): ParsedDashboardInput | ActionFailure {
  const fieldErrors: Record<string, string[]> = {};
  const parsedCurrency = currencySchema.safeParse(currency);
  const parsedPeriod =
    period === undefined ? undefined : periodSchema.safeParse(period);
  if (!parsedCurrency.success) fieldErrors.currency = [CURRENCY_MESSAGE];
  if (parsedPeriod && !parsedPeriod.success)
    fieldErrors.period = [PERIOD_MESSAGE];
  else if (
    parsedPeriod &&
    !isWithinMaxCustomPeriod(parsedPeriod.data.from, parsedPeriod.data.to)
  ) {
    fieldErrors.period = [PERIOD_TOO_LONG];
  }
  if (!parsedCurrency.success || Object.keys(fieldErrors).length > 0) {
    return fail('VALIDATION', 'Please fix the highlighted fields.', {
      fieldErrors,
    });
  }
  return {
    success: true,
    currency: parsedCurrency.data,
    period: parsedPeriod?.data,
  };
}

/**
 * `[from at 00:00Z, the day after to at 00:00Z)`. Issue and due dates are stored calendar days
 * (T25), so a period is compared by calendar day with no zone: the zone only decides which days
 * `from` and `to` are (the preset and "today").
 */
export function periodBounds(period: DashboardPeriod): [Date, Date] {
  return utcDayRange(period.from, period.to);
}

// T15 (AC-14, AC-15, AC-16): the Assistant's period input, resolved to calendar days in the actor's zone.

export const ASSISTANT_PERIOD_PRESETS = ['this-month', 'last-month', 'this-year', 'last-year', 'all-time'] as const;
export type AssistantPeriodPreset = (typeof ASSISTANT_PERIOD_PRESETS)[number];
export type AssistantPeriodInput = { preset: AssistantPeriodPreset } | { from: LocalDate; to: LocalDate };
export type AppliedPeriod = { preset: AssistantPeriodPreset | null; from: LocalDate | null; to: LocalDate | null };

export const ASSISTANT_PERIOD_MESSAGE =
  'The period must be a named preset (this-month, last-month, this-year, last-year, all-time) or a from–to range of at most 5 years whose start is not after its end.';

export const NO_PERIOD: AppliedPeriod = { preset: null, from: null, to: null };

const p2 = (n: number) => String(n).padStart(2, '0');
const lastDayOfMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

function presetRange(preset: Exclude<AssistantPeriodPreset, 'all-time'>, today: LocalDate): DashboardPeriod {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  if (preset === 'this-year') return { from: `${y}-01-01`, to: `${y}-12-31` };
  if (preset === 'last-year') return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
  const [py, pm] = preset === 'this-month' ? [y, m] : m === 1 ? [y - 1, 12] : [y, m - 1];
  return { from: `${py}-${p2(pm)}-01`, to: `${py}-${p2(pm)}-${p2(lastDayOfMonth(py, pm))}` };
}

/** The calendar month `today` falls in, as a period (the chart's default when no period is given). */
export const currentMonthPeriod = (today: LocalDate): DashboardPeriod => presetRange('this-month', today);

export type ResolvedAssistantPeriod = { applied: AppliedPeriod; range: DashboardPeriod | null };

/** `undefined` is no period; anything else must be a preset or a real from-to range of at most 5 years. */
export function resolveAssistantPeriod(input: unknown, today: LocalDate): ResolvedAssistantPeriod | ActionFailure {
  if (input === undefined) return { applied: NO_PERIOD, range: null };
  const refuse = () =>
    fail('VALIDATION', ASSISTANT_PERIOD_MESSAGE, { fieldErrors: { period: [ASSISTANT_PERIOD_MESSAGE] } });
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return refuse();
  const o = input as Record<string, unknown>;
  const keys = Object.keys(o);
  if (keys.length === 1 && keys[0] === 'preset') {
    const preset = ASSISTANT_PERIOD_PRESETS.find((p) => p === o.preset);
    if (!preset) return refuse();
    if (preset === 'all-time') return { applied: { preset, from: null, to: null }, range: null };
    const range = presetRange(preset, today);
    return { applied: { preset, ...range }, range };
  }
  if (keys.length === 2 && 'from' in o && 'to' in o) {
    const { from, to } = o;
    if (!isRealLocalDate(from) || !isRealLocalDate(to) || !isWithinMaxCustomPeriod(from, to)) return refuse();
    return { applied: { preset: null, from, to }, range: { from, to } };
  }
  return refuse();
}
