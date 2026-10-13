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
import { ok, type ActionResult } from '@/types/result';
import type { CurrencyTab } from '@/types/dashboard';
import type { AllowanceState } from '@/lib/validations/assistant-chat';
import type { ConversationSummary } from '@/types/assistant/types';

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

// T22 (AC-24 notice, AC-01 entry point): session actor first, then the layer function.
export async function getDashboardNoticeState(): Promise<ActionResult<{ showOverdueRuleNotice: boolean }>> {
  const actor = await actingFreelancerFromSession();
  if (!actor.success) return actor;
  // Lazy: loading this module must not require DATABASE_URL (same reason as session-actor).
  const { getOverdueNoticeState } = await import('@/lib/services/profile/overdue-notice');
  return getOverdueNoticeState(actor.data);
}

export async function dismissOverdueRuleNotice(): Promise<ActionResult<void>> {
  const actor = await actingFreelancerFromSession();
  if (!actor.success) return actor;
  const { dismissOverdueNotice } = await import('@/lib/services/profile/overdue-notice');
  return dismissOverdueNotice(actor.data);
}

/** The entry point shows while no key has ever passed a key check (revoked keys count). */
export async function getConnectAiEntryState(): Promise<ActionResult<{ showConnectAiEntry: boolean }>> {
  const actor = await actingFreelancerFromSession();
  if (!actor.success) return actor;
  const { hasUsedAnyPersonalKey } = await import('@/lib/services/personal-keys/personal-keys');
  const used = await hasUsedAnyPersonalKey(actor.data);
  if (!used.success) return used;
  return ok({ showConnectAiEntry: !used.data });
}

/**
 * ai-chat-v2 T26 (screens.md §SCR-09; AC-30, AC-32): the dashboard AI block's read - today's allowance and the
 * latest three Conversations, owner-scoped. Read-only: it never creates a Conversation or counts a message.
 */
export async function getDashboardAiBlock(): Promise<
  ActionResult<{ allowance: AllowanceState; latest: ConversationSummary[]; timeZone: string }>
> {
  const actor = await actingFreelancerFromSession();
  if (!actor.success) return actor;
  const [{ getAllowanceState }, { listLatestConversations }] = await Promise.all([
    import('@/lib/services/assistant-usage'),
    import('@/lib/services/conversations'),
  ]);
  const [allowance, latest] = await Promise.all([
    getAllowanceState(actor.data),
    listLatestConversations(actor.data),
  ]);
  if (!allowance.success) return allowance;
  if (!latest.success) return latest;
  return ok({ allowance: allowance.data, latest: latest.data, timeZone: actor.data.timeZone });
}
