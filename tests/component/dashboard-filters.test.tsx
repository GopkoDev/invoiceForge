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
import { fireEvent, render, screen } from '@testing-library/react';

import { PERIOD_TOO_LONG } from '@/lib/validations/dashboard-period';

import { DashboardFilters } from '@/components/dashboard/header/dashboard-filters';

// T7 (AC-07b, AC-08) — the Calendar is stubbed so a test can pick an arbitrary range without
// paging through years of months; the stub forwards exactly what react-day-picker would hand
// to `onSelect` (local-midnight Dates).
vi.mock('@/components/ui/calendar', () => ({
  Calendar: ({
    onSelect,
  }: {
    onSelect: (r: { from?: Date; to?: Date }) => void;
  }) => (
    <div>
      <button
        onClick={() =>
          onSelect({ from: new Date(2021, 0, 1), to: new Date(2026, 0, 1) })
        }
      >
        pick-exact-5y
      </button>
      <button
        onClick={() =>
          onSelect({ from: new Date(2021, 0, 1), to: new Date(2026, 0, 2) })
        }
      >
        pick-5y-plus-1d
      </button>
      <button
        onClick={() =>
          onSelect({ from: new Date(2020, 1, 29), to: new Date(2025, 1, 28) })
        }
      >
        pick-leap-start
      </button>
      <button onClick={() => onSelect({ from: new Date(2021, 0, 1) })}>
        pick-start-only
      </button>
    </div>
  ),
}));

function openFilter(onChange = vi.fn()) {
  render(<DashboardFilters onDateRangeChange={onChange} />);
  fireEvent.click(screen.getByRole('button', { name: /select date range/i }));
  return onChange;
}

describe('DashboardFilters (component, T7 five-year cap)', () => {
  it('AC-07b: refuses 5 years + 1 day, shows PERIOD_TOO_LONG, stays open, no navigation', async () => {
    const onChange = openFilter();
    fireEvent.click(await screen.findByText('pick-5y-plus-1d'));
    expect(await screen.findByText(PERIOD_TOO_LONG)).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText('pick-5y-plus-1d')).toBeInTheDocument();
  });

  it('AC-08: applies exactly 5 calendar years with no alert', async () => {
    const onChange = openFilter();
    fireEvent.click(await screen.findByText('pick-exact-5y'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(PERIOD_TOO_LONG)).not.toBeInTheDocument();
  });

  it('AC-08: 29 Feb 2020 to 28 Feb 2025 is applied', async () => {
    const onChange = openFilter();
    fireEvent.click(await screen.findByText('pick-leap-start'));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('shows no alert while only a start date is picked', async () => {
    openFilter();
    fireEvent.click(await screen.findByText('pick-start-only'));
    expect(screen.queryByText(PERIOD_TOO_LONG)).not.toBeInTheDocument();
  });

  it('a preset pick after the alert clears it and applies all time', async () => {
    const onChange = openFilter();
    fireEvent.click(await screen.findByText('pick-5y-plus-1d'));
    expect(await screen.findByText(PERIOD_TOO_LONG)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'All Time', hidden: true })
    );
    expect(onChange).toHaveBeenCalledWith(undefined, 'all-time');
    expect(screen.queryByText(PERIOD_TOO_LONG)).not.toBeInTheDocument();
  });
});

describe('DashboardFilters (component, AC-25)', () => {
  it('shows the appliedRange passed by the page, e.g. the current-month fallback', () => {
    const appliedRange = {
      start: new Date('2026-09-01T00:00:00.000Z'),
      endExclusive: new Date('2026-10-01T00:00:00.000Z'),
    };

    render(
      <DashboardFilters
        appliedRange={appliedRange}
        onDateRangeChange={vi.fn()}
      />
    );

    expect(screen.getByText(/sep 01, 2026/i)).toBeInTheDocument();
    expect(screen.queryByText(/all time/i)).not.toBeInTheDocument();
  });
});
