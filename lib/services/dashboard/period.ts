import 'server-only';
import { z } from 'zod';
import { Currency } from '@prisma/client';
import { fail, type ActionFailure } from '@/types/result';
import { localDayRange } from '@/lib/services/_shared/time-zone';

/** Inclusive local calendar dates (YYYY-MM-DD), read in the actor's time zone. */
export type LocalDate = string;
export type DashboardPeriod = { from: LocalDate; to: LocalDate };

export const PERIOD_MESSAGE = 'Give both dates as YYYY-MM-DD, with the start on or before the end.';
export const CURRENCY_MESSAGE = 'Unknown currency.';

const isRealLocalDate = (value: unknown): value is LocalDate => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
};

const periodSchema = z
  .object({ from: z.custom<LocalDate>(isRealLocalDate), to: z.custom<LocalDate>(isRealLocalDate) })
  .refine((p) => p.from <= p.to);

const currencySchema = z.nativeEnum(Currency);

export type ParsedDashboardInput = { success: true; currency: Currency; period?: DashboardPeriod };

/** Validates currency and the optional period; one message per field, no query runs on failure. */
export function parseDashboardInput(currency: unknown, period: unknown): ParsedDashboardInput | ActionFailure {
  const fieldErrors: Record<string, string[]> = {};
  const parsedCurrency = currencySchema.safeParse(currency);
  const parsedPeriod = period === undefined ? undefined : periodSchema.safeParse(period);
  if (!parsedCurrency.success) fieldErrors.currency = [CURRENCY_MESSAGE];
  if (parsedPeriod && !parsedPeriod.success) fieldErrors.period = [PERIOD_MESSAGE];
  if (!parsedCurrency.success || (parsedPeriod && !parsedPeriod.success)) {
    return fail('VALIDATION', 'Please fix the highlighted fields.', { fieldErrors });
  }
  return { success: true, currency: parsedCurrency.data, period: parsedPeriod?.data };
}

/** `[startOfLocalDay(from), startOfLocalDay(to + 1))` in the actor's zone. */
export function periodBounds(period: DashboardPeriod, timeZone: string): [Date, Date] {
  return localDayRange(period.from, period.to, timeZone);
}
