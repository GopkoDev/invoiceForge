'use client';

import { useRouter } from 'next/navigation';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { InvoiceStatusBadge } from '@/components/invoices/invoice-status-badge';
import { InvoiceRowActions } from '@/components/invoices/invoice-row-actions';
import { InvoiceStatus } from '@/types/invoice/types';
import { RecentInvoice } from '@/types/dashboard';
import { formatCurrency } from '@/lib/helpers/format-helpers';
import { formatStoredDay, utcDateToDay } from '@/lib/helpers/calendar-day';
import { useCallback, useMemo, useState } from 'react';

const STATUS_ORDER: readonly InvoiceStatus[] = [
  'OVERDUE',
  'PENDING',
  'DRAFT',
  'PAID',
  'CANCELLED',
];

// Issue and due dates are stored calendar days: formatted in UTC so every browser zone shows the same day.
function formatDate(date: Date): string {
  return formatStoredDay(date, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function createColumns(onDataChange?: () => void): ColumnDef<RecentInvoice>[] {
  return [
    {
      accessorKey: 'invoiceNumber',
      header: 'Invoice',
      cell: ({ row }) => (
        <div className="font-medium">{row.original.invoiceNumber}</div>
      ),
    },
    {
      accessorKey: 'customerName',
      header: 'Customer',
      cell: ({ row }) => (
        <div className="max-w-50 truncate" title={row.original.customerName}>
          {row.original.customerName}
        </div>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => <InvoiceStatusBadge status={row.original.status} />,
      sortingFn: (rowA, rowB) => {
        return (
          STATUS_ORDER.indexOf(rowA.original.status) -
          STATUS_ORDER.indexOf(rowB.original.status)
        );
      },
    },
    {
      accessorKey: 'issueDate',
      header: 'Issue Date',
      cell: ({ row }) => (
        <time dateTime={utcDateToDay(new Date(row.original.issueDate))}>
          {formatDate(row.original.issueDate)}
        </time>
      ),
    },
    {
      accessorKey: 'dueDate',
      header: 'Due Date',
      cell: ({ row }) => (
        <time dateTime={utcDateToDay(new Date(row.original.dueDate))}>
          {formatDate(row.original.dueDate)}
        </time>
      ),
    },
    {
      accessorKey: 'total',
      header: 'Total',
      cell: ({ row }) => (
        <div className="font-medium">
          {formatCurrency(row.original.total, row.original.currency)}
        </div>
      ),
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => (
        <InvoiceRowActions
          invoiceId={row.original.id}
          invoiceNumber={row.original.invoiceNumber}
          status={row.original.status}
          onDataChange={onDataChange}
        />
      ),
    },
  ];
}

interface DashboardRecentInvoicesProps {
  invoices: RecentInvoice[];
}

export function DashboardRecentInvoices({
  invoices,
}: DashboardRecentInvoicesProps) {
  const router = useRouter();

  const [sorting, setSorting] = useState<SortingState>([
    { id: 'status', desc: false },
    { id: 'dueDate', desc: false },
  ]);

  // Refresh data by triggering router refresh
  const handleDataChange = useCallback(() => {
    router.refresh();
  }, [router]);

  const columns = useMemo(
    () => createColumns(handleDataChange),
    [handleDataChange]
  );

  const table = useReactTable({
    data: invoices,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <section
      className="flex flex-col gap-4"
      aria-labelledby="recent-invoices-title"
    >
      <h2 id="recent-invoices-title" className="sr-only">
        Recent Invoices
      </h2>
      <div className="px-4 lg:px-6">
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader className="bg-muted sticky top-0 z-10">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      colSpan={header.colSpan}
                      scope="col"
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody className="**:data-[slot=table-cell]:first:w-8">
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && 'selected'}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center"
                    role="status"
                  >
                    No invoices yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </section>
  );
}
