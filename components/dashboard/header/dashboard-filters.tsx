'use client';

import * as React from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';
import {
  endOfMonth,
  endOfYear,
  format,
  startOfMonth,
  startOfYear,
  subMonths,
  subYears,
} from 'date-fns';
import type { DateRange } from 'react-day-picker';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type DatePreset =
  | 'this-month'
  | 'last-month'
  | 'this-year'
  | 'last-year'
  | 'all-time'
  | 'custom';

interface DashboardFiltersProps {
  dateRange: DateRange | undefined;
  onDateRangeChange: (
    range: { from?: Date; to?: Date } | undefined,
    preset?: string
  ) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const PRESETS: ReadonlyArray<{ value: DatePreset; label: string }> = [
  { value: 'this-month', label: 'This Month' },
  { value: 'last-month', label: 'Last Month' },
  { value: 'this-year', label: 'This Year' },
  { value: 'last-year', label: 'Last Year' },
  { value: 'all-time', label: 'All Time' },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Calculate date range for preset
// ─────────────────────────────────────────────────────────────────────────────
function getPresetDateRange(preset: DatePreset): DateRange | undefined {
  const now = new Date();

  switch (preset) {
    case 'this-month':
      return { from: startOfMonth(now), to: endOfMonth(now) };
    case 'last-month': {
      const lastMonth = subMonths(now, 1);
      return { from: startOfMonth(lastMonth), to: endOfMonth(lastMonth) };
    }
    case 'this-year':
      return { from: startOfYear(now), to: endOfYear(now) };
    case 'last-year': {
      const lastYear = subYears(now, 1);
      return { from: startOfYear(lastYear), to: endOfYear(lastYear) };
    }
    case 'all-time':
      return undefined;
    default:
      return undefined;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
export function DashboardFilters({
  dateRange,
  onDateRangeChange,
}: DashboardFiltersProps) {
  const [preset, setPreset] = React.useState<DatePreset>('this-month');
  const [isOpen, setIsOpen] = React.useState(false);

  const handlePresetChange = React.useCallback(
    (value: DatePreset) => {
      setPreset(value);
      const newRange = getPresetDateRange(value);
      onDateRangeChange(newRange, value);
      setIsOpen(false);
    },
    [onDateRangeChange]
  );

  const handleCalendarSelect = React.useCallback(
    (range: DateRange | undefined) => {
      if (range?.from && range?.to) {
        setPreset('custom');
        onDateRangeChange(range);
        setIsOpen(false);
      }
    },
    [onDateRangeChange]
  );

  // Format display text
  const displayText = React.useMemo(() => {
    if (!dateRange?.from) return 'All Time';
    if (!dateRange.to) return format(dateRange.from, 'LLL dd, y');
    return `${format(dateRange.from, 'LLL dd, y')} - ${format(dateRange.to, 'LLL dd, y')}`;
  }, [dateRange]);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            className={cn(
              'w-60 justify-start text-left font-normal',
              !dateRange && 'text-muted-foreground'
            )}
            aria-label="Select date range"
            aria-expanded={isOpen}
          >
            <CalendarIcon className="mr-2 size-4" aria-hidden="true" />
            {displayText}
          </Button>
        }
      />
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex">
          {/* Presets sidebar */}
          <nav
            className="flex flex-col gap-2 border-r p-3"
            role="navigation"
            aria-label="Date presets"
          >
            {PRESETS.map((p) => (
              <Button
                key={p.value}
                variant={preset === p.value ? 'default' : 'ghost'}
                className="w-full justify-start text-sm font-normal"
                onClick={() => handlePresetChange(p.value)}
                aria-pressed={preset === p.value}
              >
                {p.label}
              </Button>
            ))}
          </nav>

          {/* Calendar */}
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={dateRange?.from}
            selected={dateRange}
            onSelect={handleCalendarSelect}
            numberOfMonths={2}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
