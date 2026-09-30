// @vitest-environment jsdom
// T35 (spec.md §5 AC-12; review-2026-09-27.md F-14) — SCR-02 "duplicated" needs the toast
// "Duplicated as {invoiceNumber}" with no navigation. The code shows a generic toast and
// navigates to the editor.
//
// docs/features/architecture-hardening/tasks.json T35, cite
// components/invoice-row-actions.tsx:115-116; screens.md SCR-02 "duplicated" row.
//
// RED: handleDuplicate in components/invoices/invoice-row-actions.tsx shows a generic
// toast.success('Invoice duplicated successfully') and calls router.push to the editor. The
// spec requires the toast to name the new invoice number and to stay on the list.
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ok, fail } from '@/types/actions';

const duplicateInvoiceMock = vi.fn();
vi.mock('@/lib/actions/invoice-actions/invoice-actions', () => ({
  duplicateInvoice: (...args: unknown[]) => duplicateInvoiceMock(...args),
  deleteInvoice: vi.fn(),
  updateInvoiceStatus: vi.fn(),
  getInvoice: vi.fn(),
}));

const routerPush = vi.fn();
const routerRefresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, refresh: routerRefresh }),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: { success: (...args: unknown[]) => toastSuccess(...args), error: (...args: unknown[]) => toastError(...args) },
}));

vi.mock('@/store/use-modal-store', () => ({
  useModal: () => ({ open: vi.fn(), close: vi.fn(), isOpen: false, props: undefined }),
}));

const { InvoiceRowActions } = await import('@/components/invoices/invoice-row-actions');

async function openMenuAndDuplicate(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /actions for/i }));
  await user.click(await screen.findByText('Duplicate'));
}

describe('SCR-02 duplicated state (T35, AC-12, F-14)', () => {
  beforeEach(() => {
    duplicateInvoiceMock.mockReset();
    routerPush.mockReset();
    routerRefresh.mockReset();
    toastSuccess.mockReset();
    toastError.mockReset();
  });

  it('shows "Duplicated as {invoiceNumber}" and stays on the list', async () => {
    const user = userEvent.setup();
    duplicateInvoiceMock.mockResolvedValue(ok({ id: 'inv-2', invoiceNumber: 'INV-0099' }));

    render(<InvoiceRowActions invoiceId="inv-1" invoiceNumber="INV-0001" status="DRAFT" />);

    await openMenuAndDuplicate(user);

    expect(toastSuccess).toHaveBeenCalledWith('Duplicated as INV-0099');
    expect(routerPush).not.toHaveBeenCalled();
  });

  it('T41 N-07: a source with rule-breaking amounts toasts the action\'s plain-list message, never "Please fix the highlighted fields."', async () => {
    const user = userEvent.setup();
    const message = "This invoice can't be duplicated. Price can't be negative.";
    duplicateInvoiceMock.mockResolvedValue(fail('FAILED', message));

    render(<InvoiceRowActions invoiceId="inv-1" invoiceNumber="INV-0001" status="DRAFT" />);

    await openMenuAndDuplicate(user);

    expect(toastError).toHaveBeenCalledWith(message);
    expect(toastError).not.toHaveBeenCalledWith('Please fix the highlighted fields.');
    expect(routerPush).not.toHaveBeenCalled();
  });

  it('still toasts the result error and stays on the list when duplication fails', async () => {
    const user = userEvent.setup();
    duplicateInvoiceMock.mockResolvedValue(fail('NOT_FOUND', 'Invoice not found.'));

    render(<InvoiceRowActions invoiceId="inv-1" invoiceNumber="INV-0001" status="DRAFT" />);

    await openMenuAndDuplicate(user);

    expect(toastError).toHaveBeenCalledWith('Invoice not found.');
    expect(routerPush).not.toHaveBeenCalled();
  });
});
