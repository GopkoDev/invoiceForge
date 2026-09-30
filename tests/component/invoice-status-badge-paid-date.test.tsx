// @vitest-environment jsdom
// T35 (spec.md §5 AC-18; review-2026-09-27.md F-15) — SCR-02 "status-changed" needs the row's
// paid date, but `paidAt` is neither selected nor shown.
//
// docs/features/architecture-hardening/tasks.json T35, cite
// components/invoice-status-badge.tsx / components/invoices/invoices-data-table.tsx.
//
// RED: InvoiceStatusBadge only ever renders the status label; it has no paidAt prop and no
// slot for the paid date, and InvoicesDataTable never passes one, so a Paid row shows no date
// anywhere in the list (screens.md SCR-02 wireframe: "[Paid 21.09]").
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InvoiceStatusBadge } from '@/components/invoices/invoice-status-badge';
import { InvoicesDataTable } from '@/components/invoices/invoices-data-table';
import { InvoiceListItem } from '@/types/invoice/types';

// InvoicesDataTable renders InvoiceRowActions per row, which imports the real server actions
// module (and through it, the Prisma client). Mock it so this render-only test needs no
// DATABASE_URL, matching how other component tests avoid pulling Prisma into jsdom.
vi.mock('@/lib/actions/invoice-actions/invoice-actions', () => ({
  duplicateInvoice: vi.fn(),
  deleteInvoice: vi.fn(),
  updateInvoiceStatus: vi.fn(),
  getInvoice: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

describe('InvoiceStatusBadge — paid date (T35, AC-18, F-15)', () => {
  it('shows the paid date next to the status label for a Paid invoice', () => {
    render(<InvoiceStatusBadge status="PAID" paidAt={new Date('2026-09-21T10:00:00Z')} />);

    expect(screen.getByText(/Sep 21, 2026/)).toBeInTheDocument();
  });

  // T50 (R-07, AC-18, ADR-0010): the day is the Freelancer's day from the tz cookie, passed as
  // `timeZone`; it must not depend on the process zone.
  it('shows the Kiritimati day when that zone is passed', () => {
    render(
      <InvoiceStatusBadge
        status="PAID"
        paidAt={new Date('2026-09-21T23:30:00Z')}
        timeZone="Pacific/Kiritimati"
      />
    );
    expect(screen.getByText(/Sep 22, 2026/)).toBeInTheDocument();
  });

  it('shows the New York day for a 02:00Z paid timestamp', () => {
    render(
      <InvoiceStatusBadge
        status="PAID"
        paidAt={new Date('2026-09-22T02:00:00Z')}
        timeZone="America/New_York"
      />
    );
    expect(screen.getByText(/Sep 21, 2026/)).toBeInTheDocument();
  });

  it('falls back to the UTC day when no zone is passed', () => {
    render(<InvoiceStatusBadge status="PAID" paidAt={new Date('2026-09-22T02:00:00Z')} />);
    expect(screen.getByText(/Sep 22, 2026/)).toBeInTheDocument();
  });

  it('shows no date for a non-Paid invoice, even if paidAt is set (defensive)', () => {
    render(<InvoiceStatusBadge status="PENDING" paidAt={null} />);

    expect(screen.queryByText(/2026/)).not.toBeInTheDocument();
  });
});

const baseInvoice: InvoiceListItem = {
  id: 'inv-1',
  invoiceNumber: 'INV-0042',
  status: 'PAID',
  issueDate: new Date('2026-09-01'),
  dueDate: new Date('2026-09-15'),
  total: 119.99,
  currency: 'USD' as InvoiceListItem['currency'],
  customerName: 'Acme',
  senderName: 'My Company',
  createdAt: new Date('2026-09-01'),
  paidAt: new Date('2026-09-21T10:00:00Z'),
};

describe('InvoicesDataTable — passes paidAt through to the row (T35, AC-18, F-15)', () => {
  it('renders the paid date for a Paid row from invoiceListSelect data', () => {
    render(
      <InvoicesDataTable
        invoices={[baseInvoice]}
        sortBy="createdAt"
        sortOrder="desc"
        onSort={() => {}}
      />
    );

    expect(screen.getByText(/Sep 21, 2026/)).toBeInTheDocument();
  });
});

describe('InvoicesDataTable — passes timeZone to the badge (T50, R-07, AC-18)', () => {
  it('formats a Paid row in the given zone', () => {
    render(
      <InvoicesDataTable
        invoices={[{ ...baseInvoice, paidAt: new Date('2026-09-22T02:00:00Z') }]}
        sortBy="createdAt"
        sortOrder="desc"
        onSort={() => {}}
        timeZone="America/New_York"
      />
    );
    expect(screen.getByText(/Sep 21, 2026/)).toBeInTheDocument();
  });
});

// T55 S-06 (review-2026-09-30-2, AC-18, ADR-0010): the zone travels cookie -> page -> container ->
// table -> badge. Every link above is tested alone; this renders the real page output so that
// dropping `timeZone` in the page or in the container puts the row back on the UTC day.
describe('invoices page wiring — paid date in the cookie time zone (T55, S-06, AC-18)', () => {
  it("shows 'Sep 21' for 2026-09-22T02:00Z when the request zone is America/New_York", async () => {
    vi.resetModules();
    vi.doMock('@/lib/helpers/time-zone', () => ({
      getRequestTimeZone: async () => 'America/New_York',
    }));
    vi.doMock('@/lib/actions/invoice-actions/invoice-actions', () => ({
      duplicateInvoice: vi.fn(),
      deleteInvoice: vi.fn(),
      updateInvoiceStatus: vi.fn(),
      getInvoice: vi.fn(),
      getPaginatedInvoices: vi.fn().mockResolvedValue({
        success: true,
        data: {
          invoices: [{ ...baseInvoice, paidAt: new Date('2026-09-22T02:00:00Z') }],
          total: 1,
          totalInvoices: 1,
          page: 1,
          pageSize: 10,
          totalPages: 1,
          filterOptions: { customers: [], senderProfiles: [] },
          applied: {
            page: 1,
            pageSize: 10,
            sortBy: 'createdAt',
            sortOrder: 'desc',
            tab: 'all',
          },
        },
      }),
    }));
    vi.doMock('@/hooks/use-invoice-filters', () => ({
      useInvoiceFilters: () => ({
        filters: { sortBy: 'createdAt', sortOrder: 'desc', tab: 'all' },
        localSearch: '',
        hasActiveFilters: false,
        setSearch: vi.fn(),
        setStatus: vi.fn(),
        setDateRange: vi.fn(),
        setCustomerId: vi.fn(),
        setSenderProfileId: vi.fn(),
        setSort: vi.fn(),
        setPage: vi.fn(),
        setPageSize: vi.fn(),
        setTab: vi.fn(),
        clearFilters: vi.fn(),
      }),
    }));
    const { default: InvoicesPage } = await import('@/app/(protected)/invoices/page');

    const element = await InvoicesPage({ searchParams: Promise.resolve({}) });
    render(element);

    expect(screen.getByText(/Sep 21, 2026/)).toBeInTheDocument();
    expect(screen.queryByText(/Sep 22, 2026/)).not.toBeInTheDocument();
  });
});
