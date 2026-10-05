// @vitest-environment jsdom
// T42 (spec.md §5 AC-22, AC-23; review-2026-10-05-r2 H-08, H-09) — a preset click sends only
// ?preset=<name> (the server resolves it in the account zone), and the pressed preset is derived
// from the applied period and today, so it is right after a reload.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams('from=2020-01-01&to=2020-01-31'),
}));
vi.mock('@/components/ui/calendar', () => ({ Calendar: () => <div /> }));

import { DashboardHeader } from '@/components/dashboard/header/dashboard-header';

const open = () =>
  fireEvent.click(screen.getByRole('button', { name: /select date range/i }));
const pressed = (name: string) =>
  screen.getByRole('button', { name, hidden: true }).getAttribute('aria-pressed');

function renderHeader(period: { from: string; to: string } | undefined) {
  render(
    <DashboardHeader
      currencyTabs={[]}
      selectedCurrency="USD"
      today="2026-11-15"
      appliedPeriod={period}
    />
  );
  open();
}

describe('dashboard presets (component, H-08/H-09)', () => {
  beforeEach(() => push.mockClear());

  it.each([
    ['This Month', 'this-month'],
    ['Last Month', 'last-month'],
    ['Next Month', 'next-month'],
    ['This Year', 'this-year'],
    ['Last Year', 'last-year'],
    ['All Time', 'all-time'],
  ])('%s sends only ?preset=%s, with no from/to', (label, preset) => {
    renderHeader({ from: '2026-11-01', to: '2026-11-30' });
    fireEvent.click(screen.getByRole('button', { name: label, hidden: true }));
    expect(push).toHaveBeenLastCalledWith(`/dashboard?preset=${preset}`, {
      scroll: false,
    });
  });

  it.each([
    ['Last Month', { from: '2026-10-01', to: '2026-10-31' }],
    ['This Month', { from: '2026-11-01', to: '2026-11-30' }],
    ['Next Month', { from: '2026-12-01', to: '2026-12-31' }],
    ['This Year', { from: '2026-01-01', to: '2026-12-31' }],
    ['Last Year', { from: '2025-01-01', to: '2025-12-31' }],
    ['All Time', undefined],
  ])('after a load with the applied period for %s, only that preset is pressed', (label, period) => {
    renderHeader(period);
    const all = [
      'Next Month', 'This Month', 'Last Month', 'This Year', 'Last Year', 'All Time',
    ];
    for (const name of all) {
      expect(pressed(name)).toBe(name === label ? 'true' : 'false');
    }
  });

  it('a custom applied period presses no preset', () => {
    renderHeader({ from: '2026-11-03', to: '2026-11-09' });
    for (const name of [
      'Next Month', 'This Month', 'Last Month', 'This Year', 'Last Year', 'All Time',
    ]) {
      expect(pressed(name)).toBe('false');
    }
  });
});
