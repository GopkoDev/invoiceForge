'use server';

import { unstable_cache } from 'next/cache';
import type { Currency } from '@prisma/client';
import { actingFreelancerFromSession } from '@/lib/helpers/session-actor';
import {
  getChartData,
  getCurrencyTabs,
  getDebtors,
  getExpectedPayments,
  getRecentInvoices,
  getSenderAccounts,
  getSummaryStats,
  type DashboardPeriod,
} from '@/lib/services/dashboard/dashboard';
import type { ActionResult } from '@/types/result';
import type { CurrencyTab } from '@/types/dashboard';

// T19 (service-layer; public-api.md §2.7 + §3): thin wrappers. Session actor first (UNAUTHORIZED is
// returned and no business function runs), then the layer function, result returned untouched.
// The dashboard.<section> Sentry spans live in lib/services/dashboard.

const CACHE_TAGS = {
  dashboard: 'dashboard',
  currencyTabs: 'dashboard-currency-tabs',
} as const;

// 60 seconds cache for dashboard data
const CACHE_REVALIDATE = 60;

/** Currency tabs are cached per user for 60 s; a failed result is never cached. */
export async function getDashboardCurrencyTabs(): Promise<ActionResult<CurrencyTab[]>> {
  const actor = await actingFreelancerFromSession();
  if (!actor.success) return actor;

  let failure: ActionResult<CurrencyTab[]> | undefined;
  const cached = unstable_cache(
    async () => {
      const result = await getCurrencyTabs(actor.data);
      if (!result.success) {
        failure = result;
        throw new Error('currency tabs failed');
      }
      return result;
    },
    [`currency-tabs-${actor.data.userId}`],
    { tags: [CACHE_TAGS.currencyTabs, CACHE_TAGS.dashboard], revalidate: CACHE_REVALIDATE }
  );
  try {
    return await cached();
  } catch (error) {
    if (failure) return failure;
    throw error;
  }
}

export async function getDashboardSummaryStats(currency: Currency, period?: DashboardPeriod) {
  const actor = await actingFreelancerFromSession();
  if (!actor.success) return actor;
  return getSummaryStats(actor.data, currency, period);
}

export async function getDashboardChartData(currency: Currency, period?: DashboardPeriod) {
  const actor = await actingFreelancerFromSession();
  if (!actor.success) return actor;
  return getChartData(actor.data, currency, period);
}

export async function getDashboardSenderAccounts(currency: Currency, period?: DashboardPeriod) {
  const actor = await actingFreelancerFromSession();
  if (!actor.success) return actor;
  return getSenderAccounts(actor.data, currency, period);
}

export async function getDashboardRecentInvoices(currency: Currency) {
  const actor = await actingFreelancerFromSession();
  if (!actor.success) return actor;
  return getRecentInvoices(actor.data, currency);
}

export async function getDashboardDebtors(currency: Currency) {
  const actor = await actingFreelancerFromSession();
  if (!actor.success) return actor;
  return getDebtors(actor.data, currency);
}

export async function getDashboardExpectedPayments(currency: Currency) {
  const actor = await actingFreelancerFromSession();
  if (!actor.success) return actor;
  return getExpectedPayments(actor.data, currency);
}
