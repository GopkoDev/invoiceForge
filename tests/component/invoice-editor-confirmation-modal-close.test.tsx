// @vitest-environment jsdom
// T40 — F-47 (docs/features/architecture-hardening/_review/review-2026-09-27.md, Group 8):
// InvoiceEditor wires ConfirmationModal's onClose straight to confirmationModal.close, ignoring
// the dialog's own onClose the caller set when opening it (e.g. use-editor-header-buttons.tsx's
// openTotalsConfirmation sets onClose to clearTotalsChanged + close for SCR-15's Cancel). That
// makes clearTotalsChanged dead code: Cancel never clears totalsChanged.
//
// RED (F-47 not yet fixed): components/invoice-editor/invoice-editor.tsx passes
// `onClose={confirmationModal.close}` directly instead of `confirmationModal.props.onClose`.
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

vi.mock('@/hooks/use-invoice-reload', () => ({ useInvoiceReload: () => vi.fn() }));
vi.mock('@/store/invoice-editor-store', () => ({
  useFormData: () => ({ items: [] }),
  // invoice-integrity T16: the preview's parties and the mode replace the invalid-items filter.
  usePdfParties: () => ({ senderProfile: undefined, customer: undefined, bankAccount: undefined }),
  useSummary: () => ({ subtotal: 0, taxAmount: 0, total: 0 }),
  useEditorMode: () => 'new',
  // invoice-integrity T18: the stale / reload-failed states.
  useIsStale: () => false,
  useReloadFailed: () => false,
  useLegacy: () => null,
  useInvoiceEditorActions: () => ({ initialize: initializeMock, reset: resetMock }),
}));

const closeMock = vi.fn();
const dialogOnClose = vi.fn();
const onConfirmMock = vi.fn();

vi.mock('@/store/use-modal-store', () => ({
  useModal: () => ({
    isOpen: true,
    props: {
      title: 'Confirm the new total',
      description: 'This invoice was saved before totals were recalculated.',
      onClose: dialogOnClose,
      onConfirm: onConfirmMock,
    },
    close: closeMock,
  }),
}));

const data: InvoiceEditorData = {
  senderProfiles: [],
  bankAccounts: [],
  customers: [],
  products: [],
  customPrices: [],
};

describe('InvoiceEditor — ConfirmationModal onClose wiring (T40, F-47)', () => {
  it('calls the dialog props.onClose (not just confirmationModal.close) when Cancel is clicked', async () => {
    const user = userEvent.setup();
    render(<InvoiceEditor data={data} />);

    await user.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(dialogOnClose).toHaveBeenCalledTimes(1);
  });
});
