// @vitest-environment jsdom
// T06 (spec.md §5 AC-01/AC-03, screens.md §SCR-04 states table "unauthorized -> 401 NotSignedIn
// -> SCR-01 (AC-05, AC-21)") - the download/print path (hooks/use-invoice-pdf.tsx) is the
// natural home for the SCR-01 redirect, since it is the client component layer that can call
// next/navigation's useRouter (checklist: "Download/print: toast.warning(warning); 401 ->
// router.push('/login') (SCR-01)"). This is not covered by the test-author's given tests
// (image-to-base64.test.ts, pdf-preview-panel.test.tsx cover the fetch client + preview Alert
// only), so it is written here first, red, before the redirect is implemented.
import { act } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { InvoiceFormData } from '@/types/invoice/types';

const routerPush = vi.fn();
const assignMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
}));

const toastWarning = vi.fn();
vi.mock('sonner', () => ({
  toast: { warning: (...args: unknown[]) => toastWarning(...args), success: vi.fn(), error: vi.fn() },
}));

const { downloadPdfFromFormDataMock, printPdfFromFormDataMock } = vi.hoisted(() => ({
  downloadPdfFromFormDataMock: vi.fn(),
  printPdfFromFormDataMock: vi.fn(),
}));
vi.mock('@/lib/helpers/invoice-pdf-helpers', () => ({
  downloadPdfFromFormData: downloadPdfFromFormDataMock,
  printPdfFromFormData: printPdfFromFormDataMock,
}));

const baseFormData: InvoiceFormData = {
  invoiceNumber: 'INV-0001',
  status: 'DRAFT',
  senderProfileId: 'profile-1',
  bankAccountId: '',
  customerId: '',
  issueDate: new Date('2026-01-01'),
  dueDate: new Date('2026-01-15'),
  currency: 'USD',
  poNumber: '',
  paymentTerms: '',
  items: [],
  taxRate: 0,
  discount: 0,
  shipping: 0,
  notes: '',
  terms: '',
};

vi.mock('@/store/invoice-editor-store', () => ({
  useFormData: () => baseFormData,
  useSelectedSenderProfile: () => undefined,
  useSelectedCustomer: () => undefined,
  useSelectedBankAccount: () => undefined,
  useSummary: () => ({ subtotal: 0, taxAmount: 0, total: 0 }),
  useInvalidItems: () => [],
  useHasUnsavedChanges: () => false,
}));

import { useInvoicePdf } from '@/hooks/use-invoice-pdf';

describe('useInvoicePdf redirect on unauthorized (SCR-01)', () => {
  beforeEach(() => {
    routerPush.mockReset();
    assignMock.mockReset();
    Object.defineProperty(window, 'location', {
      value: { ...window.location, assign: assignMock },
      writable: true,
    });
    toastWarning.mockReset();
    downloadPdfFromFormDataMock.mockReset();
    printPdfFromFormDataMock.mockReset();
  });

  it('routes to the cookie-clearing sign-in route when the download path resolves { unauthorized: true }', async () => {
    downloadPdfFromFormDataMock.mockResolvedValue({ success: false, unauthorized: true });

    const { result } = renderHook(() => useInvoicePdf());

    await act(async () => {
      await result.current.DownloadButton.props.onClick();
    });

    expect(assignMock).toHaveBeenCalledWith('/api/auth/clear-session');
    expect(routerPush).not.toHaveBeenCalled();
  });

  it('routes to the cookie-clearing sign-in route when the print path resolves { unauthorized: true }', async () => {
    printPdfFromFormDataMock.mockResolvedValue({ success: false, unauthorized: true });

    const { result } = renderHook(() => useInvoicePdf());

    await act(async () => {
      await result.current.PrintButton.props.onClick();
    });

    expect(assignMock).toHaveBeenCalledWith('/api/auth/clear-session');
    expect(routerPush).not.toHaveBeenCalled();
  });

  it('does not redirect on a normal successful download', async () => {
    downloadPdfFromFormDataMock.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useInvoicePdf());

    await act(async () => {
      await result.current.DownloadButton.props.onClick();
    });

    expect(routerPush).not.toHaveBeenCalled();
  });
});
