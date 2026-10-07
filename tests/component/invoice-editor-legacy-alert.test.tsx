// @vitest-environment jsdom
// T16 — SCR-03 "legacy-shared-number": an Alert above the form when legacy.sharedNumber, saying
// the number is also used by another invoice and must be changed before saving; the invoice
// stays viewable (screens.md §SCR-03, wireframe C).
// See docs/features/architecture-hardening/tasks/t16-editor-number-and-save-states.md
//
// InvoiceEditor today never reads store.legacy, so no such Alert is ever rendered — this
// assertion is expected to fail until T16 wires it in.
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InvoiceEditor } from '@/components/invoice-editor/invoice-editor';
import type { InvoiceEditorData } from '@/types/invoice/types';

vi.mock('@/components/invoice-editor/invoice-editor-header', () => ({
  InvoiceEditorHeader: () => null,
}));
vi.mock('@/components/invoice-editor/pdf-preview-panel', () => ({
  PDFPreviewPanel: () => null,
}));
vi.mock('@/components/invoice-editor/invoice-editor-form', () => ({
  InvoiceEditorForm: () => null,
}));
vi.mock('@/components/invoice-editor/edit-sented-invoice-alert', () => ({
  EditorModeAlert: () => null,
}));
vi.mock('@/components/invoice-editor/invoice-editor-resize-panels', () => ({
  InvoiceEditorResizePanels: () => null,
}));

const initializeMock = vi.fn();
const resetMock = vi.fn();

vi.mock('@/store/invoice-editor-store', () => ({
  useFormData: () => ({ items: [] }),
  // invoice-integrity T16: the preview's parties and the mode replace the invalid-items filter.
  usePdfParties: () => ({ senderProfile: undefined, customer: undefined, bankAccount: undefined }),
  useSummary: () => ({ subtotal: 0, taxAmount: 0, total: 0 }),
  useEditorMode: () => 'new',
  useLegacy: () => ({
    storedTotal: '100.00',
    recomputedTotal: '100.00',
    sharedNumber: true,
  }),
  useInvoiceEditorActions: () => ({ initialize: initializeMock, reset: resetMock }),
}));

const data: InvoiceEditorData = {
  senderProfiles: [],
  bankAccounts: [],
  customers: [],
  products: [],
  customPrices: [],
};

describe('InvoiceEditor — legacy shared-number alert (T16)', () => {
  it('shows the shared-number warning above the form when legacy.sharedNumber is true', () => {
    render(<InvoiceEditor data={data} />);

    expect(
      screen.getByText(
        'This invoice number is also used by another invoice. Change it to a free one to save.'
      )
    ).toBeInTheDocument();
  });
});
