import 'server-only';
import * as Sentry from '@sentry/nextjs';
import type { Currency } from '@prisma/client';
import type { ChartDataPoint, CurrencyTab, DashboardSummaryStats } from '@/types/dashboard';
import { ok, type ActionResult } from '@/types/result';
import type { ActingFreelancer } from '@/lib/services/_shared/acting-freelancer';
import { failed } from '@/lib/services/_shared/result-helpers';
import { currentLocalMonth, formatLocalDateKey } from '@/lib/services/_shared/time-zone';
import { parseDashboardInput, periodBounds, type DashboardPeriod } from './period';
import { queryChartBuckets, queryCurrencyTabs, querySummaryStats, type ChartBucketing } from './queries';

export type { DashboardPeriod, LocalDate } from './period';

const DAY_MS = 24 * 60 * 60 * 1000;

const utcMs = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
const toKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export async function getCurrencyTabs(actor: ActingFreelancer): Promise<ActionResult<CurrencyTab[]>> {
  return Sentry.startSpan({ name: 'dashboard.currency-tabs', op: 'function' }, async () => {
    try {
      const currencies = await queryCurrencyTabs(actor);
      const tabs: CurrencyTab[] = currencies.map((currency) => ({ currency, label: currency }));
      // Same default as today: USD is always available.
      if (tabs.length === 0) tabs.push({ currency: 'USD', label: 'USD' });
      return ok(tabs);
    } catch (error) {
      return failed('Error fetching dashboard currency tabs:', error, 'Failed to fetch currency tabs.');
    }
  });
}

export async function getSummaryStats(
  actor: ActingFreelancer,
  currency: Currency,
  period?: DashboardPeriod,
): Promise<ActionResult<DashboardSummaryStats>> {
  return Sentry.startSpan({ name: 'dashboard.summary-stats', op: 'function' }, async () => {
    const input = parseDashboardInput(currency, period);
    if (!input.success) return input;
    try {
      const [start, endExclusive] = input.period ? periodBounds(input.period, actor.timeZone) : [null, null];
      return ok(await querySummaryStats(actor, input.currency, start, endExclusive));
    } catch (error) {
      return failed('Error fetching dashboard summary stats:', error, 'Failed to fetch summary statistics.');
    }
  });
}

/** Display groups of local days, as today: daily up to 31 days, weekly up to 180, else monthly. */
function dayGroups(dayKeys: string[]): { groups: string[][]; mode: ChartBucketing['mode'] } {
  if (dayKeys.length <= 31) return { groups: dayKeys.map((k) => [k]), mode: 'day' };
  if (dayKeys.length <= 180) {
    const groups: string[][] = [];
    for (let i = 0; i < dayKeys.length; i += 7) groups.push(dayKeys.slice(i, i + 7));
    return { groups, mode: 'week' };
  }
  const groups: string[][] = [];
  let month = '';
  for (const key of dayKeys) {
    if (key.slice(0, 7) !== month) {
      groups.push([]);
      month = key.slice(0, 7);
    }
    groups[groups.length - 1].push(key);
  }
  return { groups, mode: 'month' };
}

export async function getChartData(
  actor: ActingFreelancer,
  currency: Currency,
  period?: DashboardPeriod,
): Promise<ActionResult<ChartDataPoint[]>> {
  return Sentry.startSpan({ name: 'dashboard.chart', op: 'function' }, async () => {
    const input = parseDashboardInput(currency, period);
    if (!input.success) return input;
    try {
      const zone = actor.timeZone;
      // No period: the current local month, as the chart does today.
      const [start, endExclusive] = input.period
        ? periodBounds(input.period, zone)
        : currentLocalMonth(zone);
      const fromKey = input.period?.from ?? formatLocalDateKey(start, zone);
      const toKey_ = input.period?.to ?? formatLocalDateKey(new Date(endExclusive.getTime() - 1), zone);

      const dayKeys: string[] = [];
      for (let ms = utcMs(fromKey); ms <= utcMs(toKey_); ms += DAY_MS) dayKeys.push(toKey(ms));
      const { groups, mode } = dayGroups(dayKeys);

      const fromMonthIndex = Number(fromKey.slice(0, 4)) * 12 + Number(fromKey.slice(5, 7)) - 1;
      const rows = await queryChartBuckets(actor, input.currency, start, endExclusive, {
        mode,
        fromKey,
        fromMonthIndex,
      });
      const byBucket = new Map(rows.map((r) => [r.bucket, r]));

      const todayKey = formatLocalDateKey(new Date(), zone);
      // Running totals in whole cents: the SQL sums are exact, so no float drift builds up here.
      const toCents = (n: number) => Math.round(n * 100);
      let paidCents = 0;
      let expectedCents = 0;
      const points = groups.map((group, index): ChartDataPoint => {
        const row = byBucket.get(index);
        paidCents += toCents(row?.paid ?? 0);
        if (group[0] <= todayKey) expectedCents = paidCents;
        else expectedCents += toCents(row?.planned ?? 0);
        return { date: group[0], paid: paidCents / 100, expected: expectedCents / 100 };
      });
      return ok(points);
    } catch (error) {
      return failed('Error fetching dashboard chart data:', error, 'Failed to fetch chart data.');
    }
  });
}
