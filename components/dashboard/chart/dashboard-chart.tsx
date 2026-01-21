'use client';

import { Area, AreaChart, CartesianGrid, XAxis } from 'recharts';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { ChartDataPoint } from '@/types/dashboard';
import { formatCurrency } from '@/lib/helpers/format-helpers';

const chartConfig = {
  paid: {
    label: 'Received',
    color: 'var(--primary)',
  },
  expected: {
    label: 'Planned',
    color: 'var(--primary)',
  },
} satisfies ChartConfig;

interface DashboardChartProps {
  data: ChartDataPoint[];
  currency: string;
}

export function DashboardChart({ data, currency }: DashboardChartProps) {
  const isNoData =
    data.length === 0 ||
    data.every((point) => point.paid === 0 && point.expected === 0);

  if (isNoData) {
    return (
      <Card className="@container/card">
        <CardHeader>
          <CardTitle>Financial Performance</CardTitle>
          <CardDescription>No data available for this period</CardDescription>
        </CardHeader>
        <CardContent className="flex h-64 items-center justify-center">
          <p className="text-muted-foreground">
            No invoices found for the selected filters
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Financial Performance</CardTitle>
        <CardDescription>
          Overview of Received and Planned payments ({currency})
        </CardDescription>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        <ChartContainer
          config={chartConfig}
          className="aspect-auto h-64 w-full"
        >
          <AreaChart data={data}>
            <defs>
              <linearGradient id="fillReceived" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-paid)"
                  stopOpacity={1.0}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-paid)"
                  stopOpacity={0.1}
                />
              </linearGradient>
              <linearGradient id="fillPlanned" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-expected)"
                  stopOpacity={0.6}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-expected)"
                  stopOpacity={0.1}
                />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={(value) => {
                const date = new Date(value);
                return date.toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                });
              }}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  labelFormatter={(value) => {
                    return new Date(value).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    });
                  }}
                  formatter={(value, name) => (
                    <div className="flex items-center gap-2">
                      <span className="capitalize">{name}:</span>
                      <span className="font-mono font-medium">
                        {formatCurrency(value as number, currency)}
                      </span>
                    </div>
                  )}
                  indicator="dot"
                />
              }
            />
            <Area
              dataKey="expected"
              type="monotone"
              fill="url(#fillPlanned)"
              fillOpacity={0.4}
              stroke="var(--color-expected)"
            />
            <Area
              dataKey="paid"
              type="monotone"
              fill="url(#fillReceived)"
              fillOpacity={0.4}
              stroke="var(--color-paid)"
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
