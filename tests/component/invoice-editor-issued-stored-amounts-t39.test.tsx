// @vitest-environment jsdom
// editor-ux T39 (AC-10, AC-09; ADR-0002:45; review r2 N2): an issued or cancelled invoice opened in the
// editor shows and prints the amounts stored when it was issued (line amount, subtotal, tax, total), not a
// recalculation from its lines. A draft is still recomputed.
//
// Contract the test fixes for GREEN: InvoiceEditorData carries `storedAmounts: { subtotal, taxAmount, total }`
// (numbers) for a saved invoice; the stored line amount is the form item's `total` (already there).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { InvoiceEditorData, InvoiceFormData } from '@/types/invoice/types';

const h = vi.hoisted(() => ({
  loadPdfKit: vi.fn(),
  kit: { InvoicePdfDocument: () => null, generatePdfBlob: vi.fn(), downloadPdf: vi.fn(), printPdf: vi.fn() },
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock('@/lib/pdf/load-pdf-kit', async (orig) => ({
  ...(await orig<typeof import('@/lib/pdf/load-pdf-kit')>()),
  loadPdfKit: h.loadPdfKit,
}));
vi.mock('@/lib/actions/invoice-actions/invoice-actions', () => ({
  updateInvoice: vi.fn(),
  createInvoice: vi.fn(),
  generateInvoiceNumber: vi.fn().mockResolvedValue({ success: true, data: 'INV-1' }),
}));
vi.mock('@/lib/helpers/client-session-redirect', () => ({
  goToSignIn: vi.fn(),
  redirectIfUnauthorized: () => false,
}));
vi.mock('@/lib/utils/image-to-base64', () => ({ fetchLogoDataUrl: vi.fn() }));
vi.mock('@/components/invoice-editor/invoice-editor-resize-panels', () => ({
  InvoiceEditorResizePanels: ({ PDFPreviewComponent }: { PDFPreviewComponent: ReactNode }) => (
    <div data-testid="preview">{PDFPreviewComponent}</div>
  ),
}));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));

vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
Element.prototype.getAnimations = () => [];
Element.prototype.scrollIntoView = () => {};

const { InvoiceEditor } = await import('@/components/invoice-editor/invoice-editor');
const { renderWithEditorStore, emptyEditorData } = await import('../support/render-with-editor-store');

// 1 x 1,234.50 at 10% tax recalculates to subtotal 1,234.50, tax 123.45, total 1,357.95.
// The legacy stored values differ: line 1,000.00, subtotal 1,000.00, tax 77.00, total 1,077.00.
function data(status: InvoiceFormData['status']): InvoiceEditorData {
  return {
    ...emptyEditorData(),
    senderProfiles: [
      { id: 'sp-1', name: 'Studio', legalName: null, address: null, city: null, country: null, postalCode: null, email: null, phone: null, taxId: null, logo: null, invoicePrefix: 'INV', invoiceCounter: 1 },
    ],
    bankAccounts: [
      { id: 'ba-1', senderProfileId: 'sp-1', bankName: 'Bank', accountName: 'Holder', accountNumber: '1', iban: null, swift: null, currency: 'USD', isDefault: true },
    ],
    customers: [
      { id: 'cu-1', name: 'Acme', companyName: null, email: null, address: null, city: null, country: null, postalCode: null, phone: null, taxId: null, defaultCurrency: 'USD' },
    ],
    initialData: {
      invoiceNumber: 'INV-LEGACY-1', status, senderProfileId: 'sp-1', bankAccountId: 'ba-1', customerId: 'cu-1',
      issueDate: new Date('2026-03-10T00:00:00.000Z'), dueDate: new Date('2026-03-24T00:00:00.000Z'),
      currency: 'USD', poNumber: '', paymentTerms: '',
      items: [{ id: 'it-1', productId: '', productName: 'Legacy Work', description: '', unit: 'pcs', quantity: 1, price: 1234.5, total: 1000 }],
      taxRate: 10, discount: 0, shipping: 0, notes: '', terms: '',
    },
    invoiceId: 'inv-1',
    version: 1,
    issuedDetails: {
      sender: { name: 'Studio', legalName: null, taxId: null, address: null, city: null, country: null, postalCode: null, phone: null, email: null, website: null },
      customer: { name: 'Acme', companyName: null, taxId: null, email: null, phone: null, address: null, city: null, country: null, postalCode: null },
      bank: { bankName: 'Bank', accountName: 'Holder', accountNumber: '1', iban: null, swift: null },
    },
    storedAmounts: { subtotal: 1000, taxAmount: 77, total: 1077 },
  } as InvoiceEditorData;
}

const previewText = () => screen.getByTestId('preview').textContent?.replace(/\s+/g, ' ') ?? '';
const downloadedDocument = () => {
  // The kit receives the React element of the PDF; its `document` prop is the InvoiceDocument model.
  const doc = h.kit.generatePdfBlob.mock.calls[0][0].props.document;
  return { doc, text: JSON.stringify(doc) };
};

async function download() {
  fireEvent.click(screen.getByRole('button', { name: /download pdf/i }));
  await vi.waitFor(() => expect(h.kit.generatePdfBlob).toHaveBeenCalledTimes(1));
}

beforeEach(() => {
  vi.clearAllMocks();
  h.loadPdfKit.mockResolvedValue(h.kit);
  h.kit.generatePdfBlob.mockResolvedValue(new Blob(['pdf']));
});

describe.each([['PENDING'], ['PAID'], ['CANCELLED']] as const)(
  'a legacy %s invoice opened in the editor prints its stored amounts (AC-10, N2)',
  (status) => {
    it('the preview shows the stored line amount and total, not the recalculated ones', () => {
      renderWithEditorStore(<InvoiceEditor />, { initial: data(status) });
      const text = previewText();
      expect(text).toContain('$1,000.00');
      expect(text).toContain('$1,077.00');
      expect(text).toContain('$77.00');
      expect(text).not.toContain('$1,357.95');
      expect(text).not.toContain('$123.45');
      expect(within(screen.getByTestId('preview')).getByText('TOTAL:').parentElement).toHaveTextContent('$1,077.00');
    });

    it('Download hands the kit a document with the stored amounts', async () => {
      renderWithEditorStore(<InvoiceEditor />, { initial: data(status) });
      await download();
      const { doc, text } = downloadedDocument();
      expect(doc.total.value).toBe('$1,077.00');
      expect(doc.lines[0].amount).toBe('$1,000.00');
      expect(text).not.toContain('1,357.95');
      expect(text).not.toContain('123.45');
    });
  }
);

describe('a draft is still recomputed from its lines (AC-09 control)', () => {
  it('the preview and the Download model show the recalculated total', async () => {
    renderWithEditorStore(<InvoiceEditor />, { initial: data('DRAFT') });
    const text = previewText();
    expect(text).toContain('$1,357.95');
    expect(text).not.toContain('$1,077.00');
    await download();
    expect(downloadedDocument().doc.total.value).toBe('$1,357.95');
  });
});
