// @vitest-environment jsdom
// T42 (review-2026-09-28 N-06; AC-21): the invoice PDF preview modal's Download/Print send an
// unauthorized result to CLEAR_SESSION_PATH, not router.push(signIn).
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const routerPush = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: routerPush }) }));

const downloadMock = vi.fn();
const printMock = vi.fn();
vi.mock('@/lib/helpers/invoice-pdf-helpers', () => ({
  prepareInvoiceDataForPdf: () => ({}),
  downloadInvoicePdf: (...a: unknown[]) => downloadMock(...a),
  printInvoicePdf: (...a: unknown[]) => printMock(...a),
}));

vi.mock('@/components/invoice-editor/pdf-preview-panel', () => ({
  PDFPreviewPanel: () => null,
}));

vi.mock('@/store/use-modal-store', () => ({
  useModal: () => ({
    isOpen: true,
    props: { invoice: { invoiceNumber: 'INV-1' } },
    close: vi.fn(),
    open: vi.fn(),
  }),
}));

const { InvoicePdfPreviewModal } =
  await import('@/components/modals/invoice/invoice-pdf-preview-modal');

const assignMock = vi.fn();

describe('InvoicePdfPreviewModal unauthorized (T42, N-06)', () => {
  beforeEach(() => {
    routerPush.mockReset();
    assignMock.mockReset();
    downloadMock.mockReset();
    printMock.mockReset();
    Object.defineProperty(window, 'location', {
      value: { ...window.location, assign: assignMock },
      writable: true,
    });
  });

  it('Download routes to the cookie-clearing route', async () => {
    const user = userEvent.setup();
    downloadMock.mockResolvedValue({ success: false, unauthorized: true });
    render(<InvoicePdfPreviewModal />);
    await user.click(screen.getAllByRole('button', { name: /download/i })[0]);

    await waitFor(() =>
      expect(assignMock).toHaveBeenCalledWith('/api/auth/clear-session')
    );
    expect(routerPush).not.toHaveBeenCalled();
  });

  it('Print routes to the cookie-clearing route', async () => {
    const user = userEvent.setup();
    printMock.mockResolvedValue({ success: false, unauthorized: true });
    render(<InvoicePdfPreviewModal />);
    await user.click(screen.getAllByRole('button', { name: /print/i })[0]);

    await waitFor(() =>
      expect(assignMock).toHaveBeenCalledWith('/api/auth/clear-session')
    );
    expect(routerPush).not.toHaveBeenCalled();
  });
});
