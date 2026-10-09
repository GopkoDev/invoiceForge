'use client';

import { useMemo } from 'react';
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import Link from 'next/link';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  InvoiceListItem,
  InvoiceSortField,
  SortDirection,
} from '@/types/invoice/types';
import { formatCurrency } from '@/lib/helpers/format-helpers';
import { protectedRoutes } from '@/config/routes.config';
import { InvoiceStatusBadge } from './invoice-status-badge';
import { InvoiceRowActions } from './invoice-row-actions';
import { formatStoredDay } from '@/lib/helpers/calendar-day';

interface InvoicesDataTableProps {
  invoices: InvoiceListItem[];
  sortBy: InvoiceSortField;
  sortOrder: SortDirection;
  onSort: (field: InvoiceSortField) => void;
  timeZone?: string;
}

// Issue and due dates are stored calendar days: formatted in UTC so the server and every browser zone show the same day.
function formatDate(date: Date | string): string {
  return formatStoredDay(date, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function SortButton({
  field,
  label,
  currentField,
  currentDirection,
  onSort,
}: {
  field: InvoiceSortField;
  label: string;
  currentField: InvoiceSortField;
  currentDirection: SortDirection;
  onSort: (field: InvoiceSortField) => void;
}) {
  const isActive = field === currentField;
  const Icon = isActive
    ? currentDirection === 'asc'
      ? ArrowUp
      : ArrowDown
    : ArrowUpDown;

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => onSort(field)}
      className="-ml-3 h-8 gap-1"
    >
      {label}
      <Icon className="size-3.5" />
    </Button>
  );
}

export function InvoicesDataTable({
  invoices,
  sortBy,
  sortOrder,
  onSort,
  timeZone,
}: InvoicesDataTableProps) {
  const columns = useMemo<ColumnDef<InvoiceListItem>[]>(
    () => [
      {
        accessorKey: 'invoiceNumber',
        header: () => (
          <SortButton
            field="invoiceNumber"
            label="Invoice"
            currentField={sortBy}
            currentDirection={sortOrder}
            onSort={onSort}
          />
        ),
        cell: ({ row }) => (
          <Link
            href={protectedRoutes.invoiceEdit(row.original.id)}
            className="text-primary font-medium hover:underline"
          >
            {row.original.invoiceNumber}
          </Link>
        ),
      },
      {
        accessorKey: 'customerName',
        header: 'Customer',
        cell: ({ row }) => (
          <span className="max-w-32 truncate">{row.original.customerName}</span>
        ),
      },
      {
        accessorKey: 'senderName',
        header: 'Sender',
        cell: ({ row }) => (
          <span className="text-muted-foreground max-w-32 truncate">
            {row.original.senderName}
          </span>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <InvoiceStatusBadge
            status={row.original.status}
            paidAt={row.original.paidAt}
            timeZone={timeZone}
          />
        ),
      },
      {
        accessorKey: 'issueDate',
        header: () => (
          <SortButton
            field="issueDate"
            label="Issue Date"
            currentField={sortBy}
            currentDirection={sortOrder}
            onSort={onSort}
          />
        ),
        cell: ({ row }) => formatDate(row.original.issueDate),
      },
      {
        accessorKey: 'dueDate',
        header: () => (
          <SortButton
            field="dueDate"
            label="Due Date"
            currentField={sortBy}
            currentDirection={sortOrder}
            onSort={onSort}
          />
        ),
        cell: ({ row }) => formatDate(row.original.dueDate),
      },
      {
        accessorKey: 'total',
        header: () => (
          <div className="text-right">
            <SortButton
              field="total"
              label="Total"
              currentField={sortBy}
              currentDirection={sortOrder}
              onSort={onSort}
            />
          </div>
        ),
        cell: ({ row }) => (
          <div className="text-right font-medium">
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
            storedStatus={row.original.storedStatus}
            dueDate={row.original.dueDate}
            timeZone={timeZone}
          />
        ),
      },
    ],
    [sortBy, sortOrder, onSort, timeZone]
  );

  const table = useReactTable({
    data: invoices,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader className="bg-muted">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
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
        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() && 'selected'}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                No results.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
