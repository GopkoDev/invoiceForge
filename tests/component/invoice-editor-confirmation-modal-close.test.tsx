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
import { InvoiceEditorModalContainer } from '@/components/modals/invoice-editor/invoice-editor-modal-container';

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
  useModal: (name: string) => ({
    isOpen: name === 'confirmationModal',
    props: {
      title: 'Confirm the new total',
      description: 'This invoice was saved before totals were recalculated.',
      onClose: dialogOnClose,
      onConfirm: onConfirmMock,
    },
    close: closeMock,
  }),
}));

// editor-ux T5 (AC-16): the dialog is mounted by InvoiceEditorModalContainer, not InvoiceEditor.
describe('ConfirmationModal mounting + onClose wiring (T40 F-47, editor-ux T5 AC-16)', () => {
  it('InvoiceEditorModalContainer renders the confirmation dialog', async () => {
    render(<InvoiceEditorModalContainer />);

    expect(await screen.findByText('Confirm the new total')).toBeTruthy();
  });

  it('calls the dialog props.onClose (not just confirmationModal.close) when Cancel is clicked in the container', async () => {
    const user = userEvent.setup();
    dialogOnClose.mockClear();
    render(<InvoiceEditorModalContainer />);

    await user.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(dialogOnClose).toHaveBeenCalledTimes(1);
  });

  it('InvoiceEditor itself no longer renders the confirmation dialog', async () => {
    render(<InvoiceEditor />);
    // allow the lazy dynamic() import to resolve if it were still mounted
    await new Promise((r) => setTimeout(r, 200));

    expect(screen.queryByText('Confirm the new total')).toBeNull();
  });
});
