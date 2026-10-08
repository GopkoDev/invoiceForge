// @vitest-environment jsdom
// T39 (spec.md §5 AC-21; review-2026-09-27.md F-35) —
// docs/features/architecture-hardening/tasks.json T39, cite
// components/invoices/related-invoices-list.tsx:87,102.
//
// Same gap as invoice-row-actions.tsx: the Download/Print PDF entry points on a customer/sender
// profile detail page toast `result.error` verbatim on any getInvoice() failure, including
// UNAUTHORIZED, and never route to sign-in (AC-21).
//
// RED (T39 not yet implemented): window.location.assign is never called.
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fail } from '@/types/actions';
import type { InvoiceListItem } from '@/types/invoice/types';

const getInvoiceMock = vi.fn();
vi.mock('@/lib/actions/invoice-actions/invoice-actions', () => ({
  getInvoice: (...args: unknown[]) => getInvoiceMock(...args),
}));

const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: (...args: unknown[]) => toastError(...args) },
}));

vi.mock('@/store/use-modal-store', () => ({
  useModal: () => ({ open: vi.fn(), close: vi.fn(), isOpen: false, props: undefined }),
}));

const { RelatedInvoicesList } = await import('@/components/invoices/related-invoices-list');

const invoice: InvoiceListItem = {
  id: 'inv-1',
  invoiceNumber: 'INV-0001',
  status: 'DRAFT',
  storedStatus: 'DRAFT',
  issueDate: new Date('2026-01-01'),
  dueDate: new Date('2026-01-31'),
  total: 100,
  currency: 'USD',
  customerName: 'Acme',
  senderName: 'Me',
  createdAt: new Date('2026-01-01'),
  paidAt: null,
};

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  // The row's trigger is icon-only (MoreHorizontal) with no accessible name, unlike "New
  // Invoice" and "View All Invoices".
  const trigger = screen.getAllByRole('button', { name: '' })[0];
  await user.click(trigger);
}

describe('RelatedInvoicesList PDF entry points — UNAUTHORIZED routes to sign-in (T39, F-35, AC-21)', () => {
  const assignMock = vi.fn();

  beforeEach(() => {
    getInvoiceMock.mockReset();
    toastError.mockReset();
    assignMock.mockReset();
    Object.defineProperty(window, 'location', {
      value: { ...window.location, assign: assignMock },
      writable: true,
    });
  });

  it('Download: routes to sign-in instead of a generic toast', async () => {
    const user = userEvent.setup();
    getInvoiceMock.mockResolvedValue(fail('UNAUTHORIZED', 'Not signed in.'));

    render(
      <RelatedInvoicesList invoices={[invoice]} entityType="customer" entityId="cust-1" />
    );
    await openMenu(user);
    await user.click(await screen.findByText('Download'));

    await vi.waitFor(() => expect(assignMock).toHaveBeenCalledWith('/api/auth/clear-session'));
    expect(toastError).not.toHaveBeenCalledWith('Not signed in.');
  });

  it('Print: routes to sign-in instead of a generic toast', async () => {
    const user = userEvent.setup();
    getInvoiceMock.mockResolvedValue(fail('UNAUTHORIZED', 'Not signed in.'));

    render(
      <RelatedInvoicesList invoices={[invoice]} entityType="customer" entityId="cust-1" />
    );
    await openMenu(user);
    await user.click(await screen.findByText('Print'));

    await vi.waitFor(() => expect(assignMock).toHaveBeenCalledWith('/api/auth/clear-session'));
    expect(toastError).not.toHaveBeenCalledWith('Not signed in.');
  });
});
