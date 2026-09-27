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
