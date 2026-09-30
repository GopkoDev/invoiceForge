// @vitest-environment jsdom
// T24 (spec.md §5 AC-25) — the dashboard date filter shows the range actually applied
// (`appliedRange`), not the raw link values that were parsed away, per
// docs/features/architecture-hardening/tasks/t24-dashboard-link-params.md (Inlined context —
// contracts/server-actions.md §Link parameters, Dashboard, verbatim: "The page returns
// `appliedRange` to the date filter (AC-25)"; screens.md §SCR-06, "default" row, verbatim: "The
// date filter shows the range actually applied (`appliedRange`)"; §"default (range fallback)"
// row: "The page shows the current month in the browser's time zone, the filter shows that
// month, and no notice appears") and the test-plan.md row for AC-25 (below).
//
// test-plan.md row exercised here (§AC-25, component):
//   "date filter shows the range actually applied — The SCR-06 filter displays the parsed
//   (fallback) range, not the raw link values."
//
// Assumed API (task file §Checklist item 4, verbatim: "Filter shows `appliedRange` —
// components/dashboard/header/dashboard-filters.tsx"; §Checklist item 1: appliedRange shaped as
// `{ start, endExclusive }`, same field names as lib/helpers/time-zone.ts's localDayRange /
// currentLocalMonth tuple, per the dashboard-params unit test's assumed API):
//   DashboardFilters gains an `appliedRange: { start: Date; endExclusive: Date } | undefined`
//   prop and renders it (not an internally-recomputed range) as the button label — the page
//   passes the server-computed fallback/applied range down instead of the component deriving its
//   own display purely from a raw `dateRange` prop.
//
// RED (T24 not yet implemented): DashboardFilters does not accept/display `appliedRange` yet —
// today's `dateRange` prop is left undefined by this test, so the button falls back to today's
// "All Time" label instead of showing the applied month.
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { DashboardFilters } from '@/components/dashboard/header/dashboard-filters';

describe('DashboardFilters (component, AC-25)', () => {
  it('shows the appliedRange passed by the page, e.g. the current-month fallback', () => {
    const appliedRange = {
      start: new Date('2026-09-01T00:00:00.000Z'),
      endExclusive: new Date('2026-10-01T00:00:00.000Z'),
    };

    render(
      <DashboardFilters appliedRange={appliedRange} onDateRangeChange={vi.fn()} />,
    );

    expect(screen.getByText(/sep 01, 2026/i)).toBeInTheDocument();
    expect(screen.queryByText(/all time/i)).not.toBeInTheDocument();
  });
});
