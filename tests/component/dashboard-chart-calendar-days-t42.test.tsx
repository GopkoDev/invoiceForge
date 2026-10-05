// @vitest-environment jsdom
// T42 (spec.md §5 AC-22, AC-23; review-2026-10-05-r2 H-04) — chart ticks and tooltip label a
// calendar-day string as that day in any browser zone: 2026-10-01 is "Oct 1", never "Sep 30".
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';

let tickFormatter: ((v: string) => string) | undefined;
let labelFormatter: ((v: string) => ReactNode) | undefined;

vi.mock('recharts', () => ({
  AreaChart: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Area: () => null,
  CartesianGrid: () => null,
  XAxis: (p: { tickFormatter?: (v: string) => string }) => {
    tickFormatter = p.tickFormatter;
    return null;
  },
}));
vi.mock('@/components/ui/chart', () => ({
  ChartContainer: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ChartTooltip: ({ content }: { content: ReactElement<{ labelFormatter?: (v: string) => ReactNode }> }) => {
    labelFormatter = content.props.labelFormatter;
    return null;
  },
  ChartTooltipContent: () => null,
}));

import { DashboardChart } from '@/components/dashboard/chart/dashboard-chart';

describe('DashboardChart day labels (component, H-04)', () => {
  const browserZone = process.env.TZ;
  beforeEach(() => {
    process.env.TZ = 'America/Los_Angeles';
    tickFormatter = undefined;
    labelFormatter = undefined;
    render(
      <DashboardChart
        currency="USD"
        data={[{ date: '2026-10-01', paid: 10, expected: 5 }] as never}
      />
    );
  });
  afterEach(() => {
    if (browserZone === undefined) delete process.env.TZ;
    else process.env.TZ = browserZone;
  });

  it('the axis tick for 2026-10-01 reads Oct 1 in a Los Angeles browser', () => {
    expect(tickFormatter).toBeDefined();
    expect(tickFormatter!('2026-10-01')).toBe('Oct 1');
  });

  it('the tooltip label for 2026-10-01 reads Oct 1 in a Los Angeles browser', () => {
    expect(labelFormatter).toBeDefined();
    expect(labelFormatter!('2026-10-01')).toBe('Oct 1');
  });
});
