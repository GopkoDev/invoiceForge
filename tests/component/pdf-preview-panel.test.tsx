// @vitest-environment jsdom
// T06 (spec.md §5 AC-01/AC-03, screens.md §SCR-04 "PDF output" states table + wireframe) -
// PDFPreviewPanel fetches the sender profile's logo by id through fetchLogoDataUrl and shows a
// warning Alert when the fetch fails, but still renders the rest of the PDF preview.
//
// Task checklist (t06-pdf-logo-client-and-warning.md): "Preview: render an Alert (warning) above
// the PDF with the warning text + 'The PDF was made without it.'" -
// components/invoice-editor/pdf-preview-panel.tsx.
// Edge cases: "Profile without a logo -> No request, no warning, PDF without logo (SCR-04
// no-logo-set)"; "Same profile rendered twice in one editor session -> Second render uses the
// cached data URL; no request".
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { InvoiceFormData, InvoiceSenderProfile } from '@/types/invoice/types';

// jsdom has no ResizeObserver; the panel's zoom-fit logic (unrelated to this task's ACs)
// needs one to mount at all. Test-scaffold stub only, not production code.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

const { fetchLogoDataUrlMock } = vi.hoisted(() => ({
  fetchLogoDataUrlMock: vi.fn(),
}));
vi.mock('@/lib/utils/image-to-base64', () => ({
  fetchLogoDataUrl: fetchLogoDataUrlMock,
}));

import { PDFPreviewPanel } from '@/components/invoice-editor/pdf-preview-panel';

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

function senderProfile(overrides: Partial<InvoiceSenderProfile> = {}): InvoiceSenderProfile {
  return {
    id: 'profile-1',
    name: 'Acme',
    legalName: null,
    address: null,
    city: null,
    country: null,
    postalCode: null,
    email: null,
    phone: null,
    taxId: null,
    logo: 'https://cdn.example.test/logo.png',
    invoicePrefix: 'INV',
    invoiceCounter: 1,
    ...overrides,
  };
}

describe('PDFPreviewPanel logo warning (AC-01, AC-03, SCR-04)', () => {
  beforeEach(() => {
    fetchLogoDataUrlMock.mockReset();
  });

  it('does not request a logo and shows no warning when the sender profile has none set (no-logo-set)', async () => {
    render(
      <PDFPreviewPanel
        formData={baseFormData}
        senderProfile={senderProfile({ logo: null })}
        subtotal={0}
        taxAmount={0}
        total={0}
      />
    );

    await waitFor(() => expect(fetchLogoDataUrlMock).not.toHaveBeenCalled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the specific verbatim warning + "The PDF was made without it." for a coded refusal (warn-specific)', async () => {
    fetchLogoDataUrlMock.mockResolvedValue({
      warning: 'The logo file is larger than 512 KB.',
    });

    render(
      <PDFPreviewPanel
        formData={baseFormData}
        senderProfile={senderProfile()}
        subtotal={0}
        taxAmount={0}
        total={0}
      />
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The logo file is larger than 512 KB.');
    expect(alert).toHaveTextContent('The PDF was made without it.');
  });

  it('shows the generic warning for UNAVAILABLE without revealing why (warn-generic)', async () => {
    fetchLogoDataUrlMock.mockResolvedValue({
      warning: 'The logo could not be loaded from this link.',
    });

    render(
      <PDFPreviewPanel
        formData={baseFormData}
        senderProfile={senderProfile()}
        subtotal={0}
        taxAmount={0}
        total={0}
      />
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The logo could not be loaded from this link.');
  });

  it('shows no warning when the logo is fetched successfully (with-logo)', async () => {
    fetchLogoDataUrlMock.mockResolvedValue({
      dataUrl: 'data:image/png;base64,AAAA',
    });

    render(
      <PDFPreviewPanel
        formData={baseFormData}
        senderProfile={senderProfile()}
        subtotal={0}
        taxAmount={0}
        total={0}
      />
    );

    await waitFor(() => expect(fetchLogoDataUrlMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not refetch the same profile id on a second render in the same session (edge case table)', async () => {
    fetchLogoDataUrlMock.mockResolvedValue({
      dataUrl: 'data:image/png;base64,AAAA',
    });

    const { rerender } = render(
      <PDFPreviewPanel
        formData={baseFormData}
        senderProfile={senderProfile()}
        subtotal={0}
        taxAmount={0}
        total={0}
      />
    );
    await waitFor(() => expect(fetchLogoDataUrlMock).toHaveBeenCalledTimes(1));

    rerender(
      <PDFPreviewPanel
        formData={{ ...baseFormData, notes: 'changed' }}
        senderProfile={senderProfile()}
        subtotal={0}
        taxAmount={0}
        total={0}
      />
    );

    await waitFor(() => expect(fetchLogoDataUrlMock).toHaveBeenCalledTimes(1));
  });
});
