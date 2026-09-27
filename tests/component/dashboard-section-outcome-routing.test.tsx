// T26 (spec.md §5 AC-28) — the dashboard's async Suspense section components must also route a
// `FAILED` load to the segment error boundary (SCR-17: retry + Sentry), not render zero/empty
// data in place of the section. See
// docs/features/architecture-hardening/tasks/t26-page-outcome-routing.md.
//
// AC-28 (verbatim): "... the Freelancer sees an error state with a way to retry, not an empty
// state ... " — this applies to "the dashboard" explicitly (AC-28 Given clause lists it among the
// pages in scope). Each dashboard Suspense boundary renders one of these section components
// directly (app/(protected)/dashboard/page.tsx); a section that swallows a FAILED result behind
// `result.success && result.data ? result.data : <fallback>` never reaches the segment
// `error.tsx` boundary, so the Freelancer sees a quiet zero/empty section instead of SCR-17.
//
// Seam: same pattern as tests/component/page-outcome-routing.test.tsx — the section is an async
// Server Component, called directly (not mounted into the DOM), with its loader action mocked via
// `vi.mock` so the test drives the ActionResult directly.
//
// RED (T26 dashboard sections not yet implemented): app/(protected)/dashboard/page.tsx's
// `StatsSection` currently does
// `result.success && result.data ? result.data : { totalReceived: 0, ... }` — a FAILED result
// resolves to a zeroed stats object instead of throwing, so this test currently fails with
// "promise resolved ... instead of rejecting".
import { beforeEach, describe, expect, it, vi } from 'vitest';

// DashboardRecentInvoices (pulled in transitively via the section modules) renders row actions
// that import the invoice actions module, which opens a real Prisma connection at import time —
// mocked here purely to keep this a DB-free component test, same seam as
// tests/component/page-outcome-routing.test.tsx.
vi.mock('@/lib/actions/invoice-actions/invoice-actions', () => ({
  getPaginatedInvoices: vi.fn(),
  getInvoiceEditorData: vi.fn(),
  getInvoicesByCustomer: vi.fn(),
  getInvoicesBySenderProfile: vi.fn(),
  cancelInvoice: vi.fn(),
  deleteInvoice: vi.fn(),
}));

const getDashboardSummaryStatsMock = vi.fn();
vi.mock('@/lib/actions/dashboard-actions', () => ({
  getDashboardCurrencyTabs: vi.fn(),
  getDashboardSummaryStats: (...args: unknown[]) =>
    getDashboardSummaryStatsMock(...args),
  getDashboardChartData: vi.fn(),
  getDashboardSenderAccounts: vi.fn(),
  getDashboardRecentInvoices: vi.fn(),
  getDashboardDebtors: vi.fn(),
  getDashboardExpectedPayments: vi.fn(),
}));

import { StatsSection } from '@/app/(protected)/dashboard/_sections';

beforeEach(() => {
  getDashboardSummaryStatsMock.mockReset();
});

describe('AC-28 — a FAILED dashboard section load routes to the segment error boundary', () => {
  it('StatsSection: FAILED must throw, not render zeroed stats', async () => {
    getDashboardSummaryStatsMock.mockResolvedValue({
      success: false,
      code: 'FAILED',
      error: 'Something broke upstream',
    });

    await expect(
      StatsSection({ currency: 'USD' as never, appliedRange: undefined })
    ).rejects.toThrow();
  });
});
