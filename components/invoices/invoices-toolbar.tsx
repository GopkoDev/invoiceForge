'use client';

import { Search, X, CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { InvoiceStatus, InvoiceFilterOptions } from '@/types/invoice/types';
import { cn } from '@/lib/utils';

interface InvoicesToolbarProps {
  localSearch: string;
  status: string;
  customerId: string;
  senderProfileId: string;
  dateFrom: string;
  dateTo: string;
  filterOptions: InvoiceFilterOptions;
  hasActiveFilters: boolean;
  tab: string;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onCustomerChange: (value: string) => void;
  onSenderChange: (value: string) => void;
  onDateRangeChange: (dateFrom: string, dateTo: string) => void;
  onClearFilters: () => void;
  isLoading?: boolean;
}

const STATUS_OPTIONS: { value: InvoiceStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All Statuses' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'PAID', label: 'Paid' },
  { value: 'OVERDUE', label: 'Overdue' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

export function InvoicesToolbar({
  localSearch,
  status,
  customerId,
  senderProfileId,
  dateFrom,
  dateTo,
  filterOptions,
  hasActiveFilters,
  tab,
  onSearchChange,
  onStatusChange,
  onCustomerChange,
  onSenderChange,
  onDateRangeChange,
  onClearFilters,
  isLoading,
}: InvoicesToolbarProps) {
  const dateFromValue = dateFrom ? new Date(dateFrom) : undefined;
  const dateToValue = dateTo ? new Date(dateTo) : undefined;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative max-w-sm min-w-64 flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            placeholder="Search invoices..."
            value={localSearch}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-8"
            disabled={isLoading}
          />
        </div>

        {/* Status Filter */}
        {tab === 'all' && (
          <Select
            value={status}
            onValueChange={(value) => value && onStatusChange(value)}
            disabled={isLoading}
          >
            <SelectTrigger className="w-36">
              <SelectValue>
                {STATUS_OPTIONS.find((opt) => opt.value === status)?.label ||
                  'All Statuses'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Customer Filter */}
        {filterOptions.customers.length > 0 && (
          <Select
            value={customerId || 'all'}
            onValueChange={(value) =>
              value && onCustomerChange(value === 'all' ? '' : value)
            }
            disabled={isLoading}
          >
            <SelectTrigger className="w-40">
              <SelectValue>
                {customerId
                  ? filterOptions.customers.find((c) => c.id === customerId)
                      ?.name || 'Customer'
                  : 'All Customers'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Customers</SelectItem>
              {filterOptions.customers.map((customer) => (
                <SelectItem key={customer.id} value={customer.id}>
                  {customer.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Sender Filter */}
        {filterOptions.senderProfiles.length > 0 && (
          <Select
            value={senderProfileId || 'all'}
            onValueChange={(value) =>
              value && onSenderChange(value === 'all' ? '' : value)
            }
            disabled={isLoading}
          >
            <SelectTrigger className="w-40">
              <SelectValue>
                {senderProfileId
                  ? filterOptions.senderProfiles.find(
                      (s) => s.id === senderProfileId
                    )?.name || 'Sender'
                  : 'All Senders'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Senders</SelectItem>
              {filterOptions.senderProfiles.map((sender) => (
                <SelectItem key={sender.id} value={sender.id}>
                  {sender.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Date Range Picker */}
        <Popover>
          <PopoverTrigger
            render={
              <Button
                variant="outline"
                className={cn(
                  'w-64 justify-start text-left font-normal',
                  !dateFrom && !dateTo && 'text-muted-foreground'
                )}
                disabled={isLoading}
              >
                <CalendarIcon className="size-4" />
                {dateFrom && dateTo
                  ? `${format(dateFromValue!, 'MMM d, yyyy')} - ${format(dateToValue!, 'MMM d, yyyy')}`
                  : dateFrom
                    ? `${format(dateFromValue!, 'MMM d, yyyy')} - ...`
                    : 'Select date range'}
              </Button>
            }
          />
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              selected={{
                from: dateFromValue,
                to: dateToValue,
              }}
              onSelect={(range) => {
                const from = range?.from
                  ? format(range.from, 'yyyy-MM-dd')
                  : '';
                const to = range?.to ? format(range.to, 'yyyy-MM-dd') : '';
                onDateRangeChange(from, to);
              }}
              numberOfMonths={1}
              initialFocus
            />
          </PopoverContent>
        </Popover>

        {/* Clear Filters */}
        {hasActiveFilters && (
          <Button
            variant="outline"
            size="sm"
            onClick={onClearFilters}
            disabled={isLoading}
            className="gap-1"
          >
            <X className="size-4" />
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}
