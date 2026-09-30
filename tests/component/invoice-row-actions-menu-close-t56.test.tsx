// @vitest-environment jsdom
// T56 (review-2026-09-30-2 S-10, AC-21): the real dropdown closes itself when an item is clicked,
// so the old "menu closes" assertions passed even without `finally { setOpen(false) }`. Here the
// dropdown is a controlled stand-in that never closes on its own, so the menu can only close
// through the component's own state after the rejected call settles.
import { cloneElement, createContext, useContext, type ReactElement, type ReactNode } from 'react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { duplicateMock, deleteMock, statusMock, assignMock } = vi.hoisted(() => ({
  duplicateMock: vi.fn(),
  deleteMock: vi.fn(),
  statusMock: vi.fn(),
  assignMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/lib/actions/invoice-actions/invoice-actions', () => ({
  getInvoice: vi.fn(),
  duplicateInvoice: duplicateMock,
  deleteInvoice: deleteMock,
  updateInvoiceStatus: statusMock,
}));
vi.mock('@/lib/helpers/invoice-pdf-helpers', () => ({
  downloadInvoicePdf: vi.fn(),
  printInvoicePdf: vi.fn(),
}));
vi.mock('@/lib/helpers/client-session-redirect', () => ({
  goToSignIn: () => assignMock('/api/auth/clear-session'),
  redirectIfUnauthorized: () => false,
}));

const Ctx = createContext<{ open: boolean; set: (v: boolean) => void }>({
  open: false,
  set: () => {},
});
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({
    open,
    onOpenChange,
    children,
  }: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    children: ReactNode;
  }) => <Ctx.Provider value={{ open, set: onOpenChange }}>{children}</Ctx.Provider>,
  DropdownMenuTrigger: ({ render: el }: { render: ReactElement<{ onClick?: () => void }> }) => {
    const { open, set } = useContext(Ctx);
    return cloneElement(el, { onClick: () => set(!open) });
  },
  DropdownMenuContent: ({ children }: { children: ReactNode }) => {
    const { open } = useContext(Ctx);
    return open ? <div role="menu">{children}</div> : null;
  },
  DropdownMenuItem: ({
    onClick,
    children,
  }: {
    onClick?: () => void;
    children: ReactNode;
  }) => (
    <button role="menuitem" onClick={onClick}>
      {children}
    </button>
  ),
  DropdownMenuSeparator: () => <hr />,
}));

const { InvoiceRowActions } = await import('@/components/invoices/invoice-row-actions');

beforeEach(() => {
  for (const m of [duplicateMock, deleteMock, statusMock, assignMock]) m.mockReset();
});

describe('InvoiceRowActions closes its open menu once a rejected call settles (S-10)', () => {
  for (const [label, mock] of [
    ['Duplicate', duplicateMock],
    ['Delete', deleteMock],
    ['Mark as Pending', statusMock],
  ] as const) {
    it(`${label}: the menu is still open while pending and closed after the rejection`, async () => {
      let rejectCall: (e: Error) => void = () => {};
      mock.mockImplementation(() => new Promise((_, reject) => (rejectCall = reject)));
      const user = userEvent.setup();
      render(<InvoiceRowActions invoiceId="inv-1" invoiceNumber="INV-0001" status="DRAFT" />);
      await user.click(screen.getByRole('button', { name: /actions for/i }));
      await user.click(await screen.findByText(label));

      expect(screen.getByRole('menu')).toBeInTheDocument();

      rejectCall(new Error('boom'));
      await waitFor(() => expect(assignMock).toHaveBeenCalled());
      await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    });
  }
});
