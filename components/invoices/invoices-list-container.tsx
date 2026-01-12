'use client';

import { useInvoiceFilters } from '@/hooks/use-invoice-filters';
import { InvoicesToolbar } from './invoices-toolbar';
import { InvoicesDataTable } from './invoices-data-table';
import { InvoicesTableFooter } from './invoices-table-footer';
import { InvoicesEmptyState } from './invoices-empty-state';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import type { PaginatedInvoiceList } from '@/types/invoice/types';
import type { InvoiceSortField } from '@/types/invoice/types';

interface InvoicesListContainerProps {
  data: PaginatedInvoiceList;
}

const TAB_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'final', label: 'Sent' },
  { value: 'drafts', label: 'Drafts' },
] as const;

export function InvoicesListContainer({ data }: InvoicesListContainerProps) {
  const {
    filters,
    localSearch,
    hasActiveFilters,
    setSearch,
    setStatus,
    setDateRange,
    setCustomerId,
    setSenderProfileId,
    setSort,
    setPage,
    setPageSize,
    setTab,
    clearFilters,
  } = useInvoiceFilters();

  const {
    invoices,
    total,
    page,
    pageSize,
    totalPages,
    filterOptions,
    totalInvoices,
  } = data;

  const getEmptyStateType = () => {
    if (totalInvoices === 0) {
      return 'no-invoices';
    }
    if (hasActiveFilters) {
      return 'no-filter-results';
    }
    return 'no-tab-results';
  };

  const currentTabLabel =
    TAB_OPTIONS.find((tab) => tab.value === (filters.tab || 'all'))?.label ||
    'invoices';

  const handleSort = (field: InvoiceSortField) => {
    const newDirection =
      field === filters.sortBy && filters.sortOrder === 'desc' ? 'asc' : 'desc';
    setSort(field, newDirection);
  };

  return (
    <div className="space-y-4">
      <Tabs
        value={filters.tab || 'all'}
        onValueChange={(value) => setTab(value as 'all' | 'drafts' | 'final')}
      >
        <TabsList>
          {TAB_OPTIONS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <InvoicesToolbar
        localSearch={localSearch}
        status={filters.status}
        customerId={filters.customerId}
        senderProfileId={filters.senderProfileId}
        dateFrom={filters.dateFrom}
        dateTo={filters.dateTo}
        filterOptions={filterOptions}
        hasActiveFilters={!!hasActiveFilters}
        tab={filters.tab || 'all'}
        onSearchChange={setSearch}
        onStatusChange={setStatus}
        onDateRangeChange={setDateRange}
        onCustomerChange={setCustomerId}
        onSenderChange={setSenderProfileId}
        onClearFilters={clearFilters}
      />

      {invoices.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <InvoicesEmptyState
              type={getEmptyStateType()}
              tabLabel={currentTabLabel}
              onClearFilters={clearFilters}
            />{' '}
          </CardContent>
        </Card>
      ) : (
        <InvoicesDataTable
          invoices={invoices}
          sortBy={filters.sortBy as InvoiceSortField}
          sortOrder={filters.sortOrder}
          onSort={handleSort}
        />
      )}

      <InvoicesTableFooter
        currentPage={page}
        totalPages={totalPages}
        total={total}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />
    </div>
  );
}
