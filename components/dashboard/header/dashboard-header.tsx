'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus } from 'lucide-react';
import { format } from 'date-fns';

import { buttonVariants } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DashboardFilters } from './dashboard-filters';
import { CurrencyTab } from '@/types/dashboard';
import { Currency } from '@prisma/client';
import { protectedRoutes } from '@/config/routes.config';

interface DashboardHeaderProps {
  currencyTabs: CurrencyTab[];
  selectedCurrency: Currency;
  dateFrom?: Date;
  dateTo?: Date;
}

/**
 * Dashboard header with URL-based state management
 * - Currency and date filters sync to URL for SEO & shareability
 * - Uses router.push with startTransition for loading states
 * - Suspense boundaries will show skeletons during navigation
 */
export function DashboardHeader({
  currencyTabs,
  selectedCurrency,
  dateFrom,
  dateTo,
}: DashboardHeaderProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = React.useTransition();

  // Build URL with new params while preserving others
  const updateSearchParams = React.useCallback(
    (updates: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());

      Object.entries(updates).forEach(([key, value]) => {
        if (value === undefined) {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      });

      startTransition(() => {
        router.push(`/dashboard?${params.toString()}`, { scroll: false });
      });
    },
    [router, searchParams]
  );

  const handleCurrencyChange = (newCurrency: string) => {
    updateSearchParams({ currency: newCurrency });
  };

  const handleDateRangeChange = (
    range: { from?: Date; to?: Date } | undefined,
    preset?: string
  ) => {
    if (preset === 'all-time') {
      updateSearchParams({
        from: undefined,
        to: undefined,
        preset: 'all-time',
      });
    } else if (range?.from && range?.to) {
      updateSearchParams({
        from: format(range.from, 'yyyy-MM-dd'),
        to: format(range.to, 'yyyy-MM-dd'),
        preset: undefined,
      });
    }
  };

  // Create DateRange object for the filters component
  const dateRange =
    dateFrom && dateTo ? { from: dateFrom, to: dateTo } : undefined;

  return (
    <header
      className="flex flex-col gap-4 px-4 sm:flex-row sm:items-center sm:justify-between lg:px-6"
      role="banner"
      aria-label="Dashboard controls"
    >
      <div className="flex items-center gap-2">
        <DashboardFilters
          dateRange={dateRange}
          onDateRangeChange={handleDateRangeChange}
        />
      </div>

      <div className="flex items-center gap-2 sm:gap-4">
        {currencyTabs.length > 0 && (
          <Tabs
            value={selectedCurrency}
            onValueChange={handleCurrencyChange}
            className="w-50 sm:w-auto"
          >
            <TabsList aria-label="Select currency">
              {currencyTabs.map((tab) => (
                <TabsTrigger
                  key={tab.currency}
                  value={tab.currency}
                  aria-label={`Filter by ${tab.label}`}
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}

        <Link
          href={protectedRoutes.invoicesNew}
          className={buttonVariants()}
          aria-label="Create new invoice"
        >
          <Plus className="mr-2 size-4" aria-hidden="true" />
          Create Invoice
        </Link>
      </div>
    </header>
  );
}
