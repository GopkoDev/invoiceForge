'use client';

import { useCallback, useMemo, useState } from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import type { DateRange } from 'react-day-picker';

import { cn } from '@/lib/utils';
import { dayToLocalDate } from '@/lib/helpers/calendar-day';
import {
  isPresetPeriodName,
  isWithinMaxCustomPeriod,
  PERIOD_TOO_LONG,
  PRESET_PERIOD_NAMES,
  presetPeriodDays,
  type PresetPeriodName,
} from '@/lib/validations/dashboard-period';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

type DatePreset = PresetPeriodName | 'all-time' | 'custom';

// T24 (spec.md §5 AC-25) — the filter shows the range the page actually applied
// (`appliedPeriod`), not a range re-derived from the raw link values, per
// docs/features/architecture-hardening/tasks/t24-dashboard-link-params.md (Checklist item 4;
// contracts/server-actions.md §Link parameters, Dashboard: "The page returns the applied range to
// the date filter").
// T36 (spec.md §5 AC-22, AC-23; review-2026-10-05 G-02) — the applied range and "today" arrive as
// calendar days (yyyy-MM-dd) read in the account zone, so the presets and the label never use the
// browser clock or zone; a day is turned into a local-midnight Date only to feed the Calendar and
// date-fns, which then show the same Y/M/D in any browser zone.
interface DashboardFiltersProps {
  appliedPeriod?: { from: string; to: string } | undefined;
  today: string;
  onDateRangeChange: (
    range: { from?: Date; to?: Date } | undefined,
    preset?: string
  ) => void;
}

const PRESET_LABELS: Record<PresetPeriodName, string> = {
  'next-month': 'Next Month',
  'this-month': 'This Month',
  'last-month': 'Last Month',
  'this-year': 'This Year',
  'last-year': 'Last Year',
};

// Named presets come from the single shared list; "All Time" is the filter's own extra choice.
const PRESETS: ReadonlyArray<{ value: DatePreset; label: string }> = [
  ...PRESET_PERIOD_NAMES.map((value) => ({
    value,
    label: PRESET_LABELS[value],
  })),
  { value: 'all-time', label: 'All Time' },
];

function getPresetDateRange(
  preset: DatePreset,
  today: string
): DateRange | undefined {
  if (!isPresetPeriodName(preset)) return undefined;
  const { from, to } = presetPeriodDays(preset, today);
  return { from: dayToLocalDate(from), to: dayToLocalDate(to) };
}

export function DashboardFilters({
  appliedPeriod,
  today,
  onDateRangeChange,
}: DashboardFiltersProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [rejectedRange, setRejectedRange] = useState<DateRange | undefined>();

  const handlePresetChange = useCallback(
    (value: DatePreset) => {
      setRejectedRange(undefined);
      const newRange = getPresetDateRange(value, today);
      onDateRangeChange(newRange, value);
      setIsOpen(false);
    },
    [onDateRangeChange, today]
  );

  const handleCalendarSelect = useCallback(
    (range: DateRange | undefined) => {
      if (range?.from && range?.to) {
        if (
          !isWithinMaxCustomPeriod(
            format(range.from, 'yyyy-MM-dd'),
            format(range.to, 'yyyy-MM-dd')
          )
        ) {
          // AC-07b: keep the popover open and the selection visible, do not navigate.
          setRejectedRange(range);
          return;
        }
        setRejectedRange(undefined);
        onDateRangeChange(range);
        setIsOpen(false);
      }
    },
    [onDateRangeChange]
  );

  // The calendar and the label both show the days the server applied, last day inclusive.
  const appliedFrom = appliedPeriod?.from;
  const appliedTo = appliedPeriod?.to;
  const selectedRange = useMemo<DateRange | undefined>(
    () =>
      appliedFrom && appliedTo
        ? { from: dayToLocalDate(appliedFrom), to: dayToLocalDate(appliedTo) }
        : undefined,
    [appliedFrom, appliedTo]
  );

  // The pressed preset is derived from the applied period and today, so it is right after a load.
  const preset: DatePreset = useMemo(() => {
    if (!appliedFrom || !appliedTo) return 'all-time';
    for (const name of PRESET_PERIOD_NAMES) {
      const days = presetPeriodDays(name, today);
      if (days.from === appliedFrom && days.to === appliedTo) return name;
    }
    return 'custom';
  }, [appliedFrom, appliedTo, today]);

  const calendarSelected = rejectedRange ?? selectedRange;

  const displayText =
    selectedRange?.from && selectedRange.to
      ? `${format(selectedRange.from, 'LLL dd, y')} - ${format(selectedRange.to, 'LLL dd, y')}`
      : 'All Time';

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            className={cn(
              'w-60 justify-start text-left font-normal',
              !appliedPeriod && 'text-muted-foreground'
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
          <div
            className="flex flex-col gap-2 border-r p-3"
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
          </div>

          {/* Calendar */}
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={selectedRange?.from}
            selected={calendarSelected}
            onSelect={handleCalendarSelect}
            numberOfMonths={2}
          />
        </div>
        {rejectedRange && (
          <Alert
            variant="destructive"
            className="rounded-t-none border-x-0 border-b-0"
          >
            <AlertDescription>{PERIOD_TOO_LONG}</AlertDescription>
          </Alert>
        )}
      </PopoverContent>
    </Popover>
  );
}
