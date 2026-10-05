// @vitest-environment jsdom
// T36 (spec.md §5 AC-22, AC-23; review-2026-10-05 G-02) — a preset picked on the dashboard puts the
// account zone's calendar days in the link, whatever the browser zone is.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(),
}));

import { DashboardHeader } from '@/components/dashboard/header/dashboard-header';

describe('DashboardHeader (component, account zone, AC-22/AC-23)', () => {
  const browserZone = process.env.TZ;
  beforeEach(() => {
    push.mockClear();
    process.env.TZ = 'America/Los_Angeles';
    // 2026-10-31 20:00 UTC: 31 October in Los Angeles (the browser), 1 November in Auckland (the account).
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-31T20:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
    if (browserZone === undefined) delete process.env.TZ;
    else process.env.TZ = browserZone;
  });

  it('This Month in an Auckland account sends November while the browser is in Los Angeles', () => {
    render(
      <DashboardHeader
        currencyTabs={[]}
        selectedCurrency="USD"
        today="2026-11-01"
        appliedPeriod={{ from: '2026-11-01', to: '2026-11-30' }}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /select date range/i }));
    fireEvent.click(screen.getByRole('button', { name: 'This Month', hidden: true }));
    expect(push).toHaveBeenLastCalledWith(
      '/dashboard?preset=this-month',
      { scroll: false }
    );
  });
});
