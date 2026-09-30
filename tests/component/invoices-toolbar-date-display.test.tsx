// @vitest-environment jsdom
//
// F-29 (review-2026-09-27): the date-range control parsed its `dateFrom`/`dateTo` props
// (`yyyy-MM-dd` strings) with `new Date(dateFrom)`, which the JS spec parses as UTC midnight.
// `date-fns`'s `format` then renders that instant in the machine's LOCAL time zone, so anyone
// west of UTC sees the previous day. This test sets the process's local time zone to
// America/New_York (UTC-4/-5) — west of UTC — before importing anything, and checks the label
// shows the actual applied date, not the day before it.
//
// docs/features/architecture-hardening/_review/review-2026-09-27.md F-29:
// components/invoices/invoices-toolbar.tsx:69-70,180-181,189-192.
process.env.TZ = 'America/New_York';

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InvoicesToolbar } from '@/components/invoices/invoices-toolbar';
import type { InvoiceFilterOptions } from '@/types/invoice/types';

const filterOptions: InvoiceFilterOptions = { customers: [], senderProfiles: [] };

const noop = () => {};

describe('InvoicesToolbar date range display (component, AC-27, F-29)', () => {
  it('shows the applied dateFrom/dateTo as-is, not a day earlier, in a time zone west of UTC', () => {
    render(
      <InvoicesToolbar
        localSearch=""
        status="all"
        customerId=""
        senderProfileId=""
        dateFrom="2026-09-15"
        dateTo="2026-09-20"
        filterOptions={filterOptions}
        hasActiveFilters
        tab="all"
        onSearchChange={noop}
        onStatusChange={noop}
        onCustomerChange={noop}
        onSenderChange={noop}
        onDateRangeChange={noop}
        onClearFilters={noop}
      />
    );

    // Buggy `new Date('2026-09-15')` read as UTC then formatted in America/New_York shows
    // "Sep 14, 2026" instead of "Sep 15, 2026".
    expect(screen.getByText('Sep 15, 2026 - Sep 20, 2026')).toBeInTheDocument();
    expect(screen.queryByText(/Sep 14, 2026/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Sep 19, 2026/)).not.toBeInTheDocument();
  });

  it('shows a single applied dateFrom as-is when dateTo is not set yet', () => {
    render(
      <InvoicesToolbar
        localSearch=""
        status="all"
        customerId=""
        senderProfileId=""
        dateFrom="2026-01-01"
        dateTo=""
        filterOptions={filterOptions}
        hasActiveFilters
        tab="all"
        onSearchChange={noop}
        onStatusChange={noop}
        onCustomerChange={noop}
        onSenderChange={noop}
        onDateRangeChange={noop}
        onClearFilters={noop}
      />
    );

    expect(screen.getByText('Jan 1, 2026 - ...')).toBeInTheDocument();
    expect(screen.queryByText(/Dec 31, 2025/)).not.toBeInTheDocument();
  });
});
