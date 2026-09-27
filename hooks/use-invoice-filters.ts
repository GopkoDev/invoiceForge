'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import type { InvoiceListParams } from '@/lib/validations/search-params';

// T23 (spec.md §5 AC-26) — every control shows `PaginatedInvoiceList.applied`, not the raw link
// (screens.md §SCR-02, verbatim: "Every control ... shows PaginatedInvoiceList.applied, not the
// raw link"), and every link this hook builds starts from `applied` too, so a bad value never
// round-trips back into the URL.
interface UseInvoiceFiltersParams {
  applied: InvoiceListParams;
}

type UpdatableKey = keyof InvoiceListParams;

export function useInvoiceFilters({ applied }: UseInvoiceFiltersParams) {
  const router = useRouter();
  const pathname = usePathname();

  const {
    page,
    pageSize,
    tab,
    search,
    status,
    customerId = '',
    senderProfileId = '',
    sortField,
    sortDirection,
    dateFrom = '',
    dateTo = '',
  } = applied;

  const [localSearch, setLocalSearch] = useState(search);
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);

  // The server may have fallen back to a different `search` than what's locally being typed
  // (e.g. navigating directly to a link with a bad/tampered value) — resync on it.
  useEffect(() => {
    setLocalSearch(search);
  }, [search]);

  const updateParams = useCallback(
    (updates: Partial<Record<UpdatableKey, string | number | undefined>>) => {
      const merged: Record<string, string | number | undefined> = {
        ...applied,
        ...updates,
      };

      const params = new URLSearchParams();
      Object.entries(merged).forEach(([key, value]) => {
        if (value === undefined || value === '' || value === 'all') {
          return;
        }
        params.set(key, String(value));
      });

      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, applied]
  );

  const setTab = useCallback(
    (newTab: 'all' | 'drafts' | 'final') => {
      setLocalSearch('');
      updateParams({
        tab: newTab,
        search: undefined,
        status: undefined,
        customerId: undefined,
        senderProfileId: undefined,
        dateFrom: undefined,
        dateTo: undefined,
        page: undefined,
      });
    },
    [updateParams]
  );

  const setSearch = useCallback(
    (value: string) => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }

      setLocalSearch(value);

      searchTimerRef.current = setTimeout(() => {
        updateParams({ search: value, page: 1 });
      }, 300);
    },
    [updateParams]
  );

  const setStatus = useCallback(
    (newStatus: string) => {
      updateParams({ status: newStatus, page: 1 });
    },
    [updateParams]
  );

  const setCustomerId = useCallback(
    (newCustomerId: string) => {
      updateParams({ customerId: newCustomerId, page: 1 });
    },
    [updateParams]
  );

  const setSenderProfileId = useCallback(
    (newSenderProfileId: string) => {
      updateParams({ senderProfileId: newSenderProfileId, page: 1 });
    },
    [updateParams]
  );

  const setDateRange = useCallback(
    (newDateFrom: string, newDateTo: string) => {
      updateParams({ dateFrom: newDateFrom, dateTo: newDateTo, page: 1 });
    },
    [updateParams]
  );

  const setPage = useCallback(
    (newPage: number) => {
      updateParams({ page: newPage });
    },
    [updateParams]
  );

  const setPageSize = useCallback(
    (newPageSize: number) => {
      updateParams({ pageSize: newPageSize, page: 1 });
    },
    [updateParams]
  );

  const setSort = useCallback(
    (field: string, direction?: 'asc' | 'desc') => {
      const newDirection =
        direction ??
        (field === sortField ? (sortDirection === 'asc' ? 'desc' : 'asc') : 'desc');

      updateParams({
        sortField: field,
        sortDirection: newDirection,
        page: 1,
      });
    },
    [updateParams, sortField, sortDirection]
  );

  const clearFilters = useCallback(() => {
    setLocalSearch('');
    updateParams({
      search: undefined,
      status: undefined,
      customerId: undefined,
      senderProfileId: undefined,
      dateFrom: undefined,
      dateTo: undefined,
      page: undefined,
    });
  }, [updateParams]);

  const hasActiveFilters = Boolean(
    search || status !== 'all' || customerId || senderProfileId || dateFrom || dateTo
  );

  // Create filters object for components
  const filters = {
    tab,
    search,
    status,
    customerId,
    senderProfileId,
    dateFrom,
    dateTo,
    sortBy: sortField,
    sortOrder: sortDirection,
  };

  return {
    page,
    pageSize,
    tab,
    search,
    status,
    customerId,
    senderProfileId,
    sortBy: sortField,
    sortOrder: sortDirection,
    dateFrom,
    dateTo,
    filters,
    localSearch,
    hasActiveFilters,
    setTab,
    setSearch,
    setStatus,
    setCustomerId,
    setSenderProfileId,
    setDateRange,
    setPage,
    setPageSize,
    setSort,
    clearFilters,
  };
}
