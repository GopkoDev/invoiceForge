'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

interface UseInvoiceFiltersParams {
  defaultPageSize?: number;
}

export function useInvoiceFilters({
  defaultPageSize = 10,
}: UseInvoiceFiltersParams = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const page = Number(searchParams.get('page')) || 1;
  const pageSize = Number(searchParams.get('pageSize')) || defaultPageSize;
  const tab = (searchParams.get('tab') as 'all' | 'drafts' | 'final') || 'all';
  const search = searchParams.get('search') || '';
  const status = searchParams.get('status') || 'all';
  const customerId = searchParams.get('customerId') || '';
  const senderProfileId = searchParams.get('senderProfileId') || '';
  const sortBy = searchParams.get('sortBy') || 'createdAt';
  const sortOrder = (searchParams.get('sortOrder') as 'asc' | 'desc') || 'desc';
  const dateFrom = searchParams.get('dateFrom') || '';
  const dateTo = searchParams.get('dateTo') || '';

  const [localSearch, setLocalSearch] = useState(search);
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);

  const updateParams = useCallback(
    (updates: Record<string, string | number | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());

      Object.entries(updates).forEach(([key, value]) => {
        if (value === undefined || value === '' || value === 'all') {
          params.delete(key);
        } else {
          params.set(key, String(value));
        }
      });

      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  const setTab = useCallback(
    (newTab: 'all' | 'drafts' | 'final') => {
      const params = new URLSearchParams();
      if (newTab !== 'all') {
        params.set('tab', newTab);
      }
      setLocalSearch(''); // Reset local search too
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname]
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
        (field === sortBy ? (sortOrder === 'asc' ? 'desc' : 'asc') : 'desc');

      updateParams({
        sortBy: field,
        sortOrder: newDirection,
        page: 1,
      });
    },
    [updateParams, sortBy, sortOrder]
  );

  const clearFilters = useCallback(() => {
    const params = new URLSearchParams();
    if (tab !== 'all') {
      params.set('tab', tab);
    }
    setLocalSearch(''); // Reset local search too
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }, [router, pathname, tab]);

  const hasActiveFilters =
    search ||
    status !== 'all' ||
    customerId ||
    senderProfileId ||
    dateFrom ||
    dateTo;

  // Create filters object for components
  const filters = {
    tab,
    search,
    status,
    customerId,
    senderProfileId,
    dateFrom,
    dateTo,
    sortBy,
    sortOrder,
  };

  return {
    page,
    pageSize,
    tab,
    search,
    status,
    customerId,
    senderProfileId,
    sortBy,
    sortOrder,
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
