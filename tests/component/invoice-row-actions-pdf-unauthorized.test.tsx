// @vitest-environment jsdom
// T39 (spec.md §5 AC-21; review-2026-09-27.md F-35) —
// docs/features/architecture-hardening/tasks.json T39, cite
// components/invoices/invoice-row-actions.tsx:90,105.
//
// AC-21: a stale session performing any action must be treated as a Visitor. handleDownload and
// handlePrint both toast `result.error` verbatim on any getInvoice() failure, including
// UNAUTHORIZED, and never route to sign-in.
//
// RED (T39 not yet implemented): neither entry point navigates anywhere on UNAUTHORIZED, so
// window.location.assign is never called.
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fail } from '@/types/actions';

const getInvoiceMock = vi.fn();
vi.mock('@/lib/actions/invoice-actions/invoice-actions', () => ({
  duplicateInvoice: vi.fn(),
  deleteInvoice: vi.fn(),
  updateInvoiceStatus: vi.fn(),
  getInvoice: (...args: unknown[]) => getInvoiceMock(...args),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: (...args: unknown[]) => toastError(...args) },
}));

vi.mock('@/store/use-modal-store', () => ({
  useModal: () => ({ open: vi.fn(), close: vi.fn(), isOpen: false, props: undefined }),
}));

const { InvoiceRowActions } = await import('@/components/invoices/invoice-row-actions');

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /actions for/i }));
}

describe('InvoiceRowActions PDF entry points — UNAUTHORIZED routes to sign-in (T39, F-35, AC-21)', () => {
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

  it('Download PDF: routes to sign-in instead of a generic toast', async () => {
    const user = userEvent.setup();
    getInvoiceMock.mockResolvedValue(fail('UNAUTHORIZED', 'Not signed in.'));

    render(
      <InvoiceRowActions invoiceId="inv-1" invoiceNumber="INV-0001" status="DRAFT" />
    );
    await openMenu(user);
    await user.click(await screen.findByText('Download PDF'));

    await vi.waitFor(() => expect(assignMock).toHaveBeenCalledWith('/api/auth/clear-session'));
    expect(toastError).not.toHaveBeenCalledWith('Not signed in.');
  });

  it('Print: routes to sign-in instead of a generic toast', async () => {
    const user = userEvent.setup();
    getInvoiceMock.mockResolvedValue(fail('UNAUTHORIZED', 'Not signed in.'));

    render(
      <InvoiceRowActions invoiceId="inv-1" invoiceNumber="INV-0001" status="DRAFT" />
    );
    await openMenu(user);
    await user.click(await screen.findByText('Print'));

    await vi.waitFor(() => expect(assignMock).toHaveBeenCalledWith('/api/auth/clear-session'));
    expect(toastError).not.toHaveBeenCalledWith('Not signed in.');
  });
});
