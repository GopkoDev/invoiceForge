// @vitest-environment jsdom
// editor-ux T36 (spec.md AC-03, AC-05, AC-05b; review 2026-10-10 T-g(a); ADR-0003, ADR-0005) — the
// save flow as the Freelancer sees it, with an edit typed while the save is on its way:
//   AC-03  after the save, the editor still says Unsaved and leaving the page asks to confirm;
//   AC-05  a refused save keeps the change typed during it on screen;
//   AC-05b Save and issue with a line edited during it shows IssuedEditsDroppedNotice with its wording,
//          the notice can be dismissed, the lines are locked as issued, and the fields an issued
//          invoice allows stay editable.
// The full editor is rendered under the real per-mount store; only the server actions are faked, and
// each save is held open by hand so the edit lands while it is in flight.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import type { InvoiceEditorData, InvoiceFormData } from '@/types/invoice/types';

const { updateInvoiceMock, createInvoiceMock, toastSuccess, toastError } = vi.hoisted(() => ({
  updateInvoiceMock: vi.fn(),
  createInvoiceMock: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: toastError, warning: vi.fn(), dismiss: vi.fn() } }));
vi.mock('@/lib/actions/invoice-actions/invoice-actions', () => ({
  updateInvoice: updateInvoiceMock,
  createInvoice: createInvoiceMock,
  generateInvoiceNumber: vi.fn().mockResolvedValue({ success: true, data: 'INV-2026-0043' }),
  getInvoiceEditorData: vi.fn(),
}));
vi.mock('@/components/invoice-editor/pdf-preview-panel', () => ({ PDFPreviewPanel: () => null }));
vi.mock('@/components/invoice-editor/invoice-editor-resize-panels', () => ({
  InvoiceEditorResizePanels: ({ FormComponent }: { FormComponent: ReactNode }) => <div>{FormComponent}</div>,
}));
vi.mock('@/hooks/use-invoice-pdf', () => ({
  useInvoicePdf: () => ({
    DownloadButton: <button>Download</button>,
    DownloadMobileButton: null,
    PrintButton: <button>Print</button>,
    PrintMobileButton: null,
  }),
}));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);
Element.prototype.getAnimations = () => [];
Element.prototype.scrollIntoView = () => {};

const { InvoiceEditor } = await import('@/components/invoice-editor/invoice-editor');
const { InvoiceEditorModalContainer } = await import(
  '@/components/modals/invoice-editor/invoice-editor-modal-container'
);
const { renderWithEditorStore } = await import('../support/render-with-editor-store');
let store: Awaited<ReturnType<typeof renderWithEditorStore>>['store'];

// The exact wording (store/invoice-editor-store/save-command.ts): only a locked detail was edited
// during the save, and a locked detail plus a field an issued invoice allows (T81).
const DROPPED_NOTICE =
  'Your changes to the lines and other locked details were not saved because the invoice is now issued.';
const DROPPED_AND_KEPT_NOTICE = `${DROPPED_NOTICE} Edits to the due date, notes, payment terms and PO number are kept for you to save.`;
const NOTES = 'Additional information for the client...';

function data(): InvoiceEditorData {
  const initialData: InvoiceFormData = {
    invoiceNumber: 'INV-2026-0042',
    status: 'DRAFT',
    senderProfileId: 'sp-1',
    bankAccountId: 'ba-1',
    customerId: 'cu-1',
    issueDate: new Date('2026-03-10T00:00:00.000Z'),
    dueDate: new Date('2026-03-24T00:00:00.000Z'),
    currency: 'USD',
    poNumber: 'PO-77',
    paymentTerms: 'Net 14',
    items: [
      { id: 'it-1', productId: 'custom', productName: 'Consulting', description: '', unit: 'h', quantity: 10, price: 150, total: 1500 },
      { id: 'it-2', productId: 'custom', productName: 'Workshop', description: '', unit: 'pcs', quantity: 1, price: 300, total: 300 },
    ],
    taxRate: 0,
    discount: 0,
    shipping: 0,
    notes: 'a note',
    terms: 'Pay by transfer',
  };
  return {
    senderProfiles: [
      { id: 'sp-1', name: 'Current Studio', legalName: null, address: null, city: null, country: null, postalCode: null, email: null, phone: null, taxId: null, logo: null, invoicePrefix: 'INV', invoiceCounter: 42 },
    ],
    bankAccounts: [
      { id: 'ba-1', senderProfileId: 'sp-1', bankName: 'Current Bank', accountName: 'Holder', accountNumber: '999', iban: null, swift: null, currency: 'USD', isDefault: true },
    ],
    customers: [
      { id: 'cu-1', name: 'Current Customer', companyName: null, email: null, address: null, city: null, country: null, postalCode: null, phone: null, taxId: null, defaultCurrency: 'USD' },
    ],
    products: [],
    customPrices: [],
    initialData,
    invoiceId: 'inv-1',
    version: 3,
    issuedDetails: null,
  } as InvoiceEditorData;
}

function savedResult(status = 'DRAFT') {
  return {
    success: true,
    data: {
      id: 'inv-1', invoiceNumber: 'INV-2026-0042', subtotal: 1800, taxAmount: 0, total: 1800, status,
      derivedOverdue: false, paidAt: null, issueDate: '2026-03-10T00:00:00.000Z', dueDate: '2026-03-24T00:00:00.000Z',
      version: 4, issuedDetails: null,
    },
  };
}

/** The next updateInvoice call stays pending until the test resolves it. */
function holdNextSave() {
  let resolve!: (v: unknown) => void;
  updateInvoiceMock.mockReturnValueOnce(new Promise((r) => (resolve = r)));
  return (value: unknown) => act(async () => resolve(value));
}

function renderEditor() {
  const rendered = renderWithEditorStore(
    <>
      <InvoiceEditor />
      <InvoiceEditorModalContainer />
    </>,
    { initial: data() }
  );
  store = rendered.store;
  return rendered;
}

/** Fires the browser's leave-page event; true when the page asked to confirm leaving. */
function leavingAsksToConfirm(): boolean {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

const firstQty = () => screen.getAllByPlaceholderText('Qty')[0] as HTMLInputElement;

beforeEach(() => {
  for (const m of [updateInvoiceMock, createInvoiceMock, toastSuccess, toastError]) m.mockReset();
});

describe('AC-03: leaving after a save during which an edit happened', () => {
  it('control: a save with no edit during it is Saved and leaving does not ask', async () => {
    renderEditor();
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText(NOTES), ' x');
    expect(leavingAsksToConfirm()).toBe(true);
    const finish = holdNextSave();
    await user.click(screen.getAllByText('Save')[0]);
    await finish(savedResult());

    await waitFor(() => expect(screen.getAllByText('Saved').length).toBeGreaterThan(0));
    expect(leavingAsksToConfirm()).toBe(false);
  });

  it('a note typed while the save runs: still Unsaved afterwards and leaving asks to confirm', async () => {
    renderEditor();
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText(NOTES), ' x');
    const finish = holdNextSave();
    await user.click(screen.getAllByText('Save')[0]);
    await waitFor(() => expect(store.getState().isSaving).toBe(true));
    await user.type(screen.getByPlaceholderText(NOTES), ' typed mid-save');
    await finish(savedResult());

    await waitFor(() => expect(store.getState().isSaving).toBe(false));
    expect(screen.getByPlaceholderText(NOTES)).toHaveValue('a note x typed mid-save');
    expect(screen.getByText('Unsaved')).toBeInTheDocument();
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
    expect(leavingAsksToConfirm()).toBe(true);
    // The save that was sent carried the form as it was when Save was pressed.
    expect(updateInvoiceMock.mock.calls[0][1].notes).toBe('a note x');
  });

  it('Home after a mid-save edit opens UnsavedChangesDialog (the in-app leave, not only beforeunload)', async () => {
    renderEditor();
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText(NOTES), ' x');
    const finish = holdNextSave();
    await user.click(screen.getAllByText('Save')[0]);
    await waitFor(() => expect(store.getState().isSaving).toBe(true));
    await user.type(screen.getByPlaceholderText(NOTES), ' typed mid-save');
    await finish(savedResult());
    await waitFor(() => expect(store.getState().isSaving).toBe(false));
    expect(screen.queryByText('Unsaved changes', { selector: '[role="alertdialog"] *' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Home/ }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Unsaved changes');
    expect(dialog).toHaveTextContent('Save and leave');
    expect(dialog).toHaveTextContent('Discard and leave');
    // The modal registry outlives the render; close it so it does not hide the next test's page.
    await user.click(screen.getByRole('button', { name: 'Cancel and stay' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('control: Home after a save with no edit during it leaves without asking', async () => {
    renderEditor();
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText(NOTES), ' x');
    const finish = holdNextSave();
    await user.click(screen.getAllByText('Save')[0]);
    await finish(savedResult());
    await waitFor(() => expect(screen.getAllByText('Saved').length).toBeGreaterThan(0));

    await user.click(screen.getByRole('button', { name: /Home/ }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});

describe('AC-05: a refused save keeps the change typed during it on screen', () => {
  it('a field-invalid refusal: the error shows and the quantity typed mid-save stays', async () => {
    renderEditor();
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText(NOTES), ' x');
    const finish = holdNextSave();
    await user.click(screen.getAllByText('Save')[0]);
    await waitFor(() => expect(store.getState().isSaving).toBe(true));
    await user.clear(firstQty());
    await user.type(firstQty(), '7');
    await finish({
      success: false,
      code: 'VALIDATION',
      error: 'Invalid amounts.',
      fieldErrors: { discount: ["Discount can't exceed the subtotal plus shipping."] },
    });

    expect(await screen.findByText("Discount can't exceed the subtotal plus shipping.")).toBeInTheDocument();
    expect(firstQty()).toHaveValue('7');
    expect(screen.getByPlaceholderText(NOTES)).toHaveValue('a note x');
    expect(screen.getByText('Unsaved')).toBeInTheDocument();
    expect(leavingAsksToConfirm()).toBe(true);
  });

  it('a changed-elsewhere refusal: the dialog opens and the note typed mid-save stays', async () => {
    renderEditor();
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText(NOTES), ' x');
    const finish = holdNextSave();
    await user.click(screen.getAllByText('Save')[0]);
    await waitFor(() => expect(store.getState().isSaving).toBe(true));
    await user.type(screen.getByPlaceholderText(NOTES), ' typed mid-save');
    await finish({
      success: false,
      code: 'CONFLICT',
      error: 'This invoice was changed elsewhere after you opened it. Reload it to see the latest version.',
      details: { kind: 'CHANGED_ELSEWHERE', currentVersion: 4 },
    });

    expect(await screen.findByText('This invoice changed elsewhere')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(NOTES)).toHaveValue('a note x typed mid-save');
    expect(screen.getByText('Unsaved')).toBeInTheDocument();
  });
});

describe('AC-05b: IssuedEditsDroppedNotice', () => {
  async function issueWithQuantityEditedMidSave() {
    renderEditor();
    const user = userEvent.setup();
    const finish = holdNextSave();
    await user.click(screen.getByText('Save and issue'));
    await waitFor(() => expect(store.getState().isSaving).toBe(true));
    await user.clear(firstQty());
    await user.type(firstQty(), '9');
    await finish(savedResult('PENDING'));
    return user;
  }

  it('control: Save and issue with no edit during it shows no notice', async () => {
    renderEditor();
    const user = userEvent.setup();
    const finish = holdNextSave();
    await user.click(screen.getByText('Save and issue'));
    await finish(savedResult('PENDING'));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Invoice issued'));
    expect(screen.queryByText(DROPPED_NOTICE)).not.toBeInTheDocument();
  });

  it('shows with its wording, the lines are locked as issued, the allowed fields stay editable', async () => {
    await issueWithQuantityEditedMidSave();

    const notice = await screen.findByText(DROPPED_NOTICE);
    expect(notice.closest('[role="status"]')).not.toBeNull();
    // The lines are as they were issued, and locked.
    expect(firstQty()).toHaveValue('10');
    for (const input of screen.getAllByPlaceholderText('Qty')) expect(input).toBeDisabled();
    for (const input of screen.getAllByPlaceholderText('Price')) expect(input).toBeDisabled();
    expect(screen.queryByText('From List')).not.toBeInTheDocument();
    expect(screen.queryByText('Custom Item')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Delete')).not.toBeInTheDocument();
    // The fields an issued invoice allows stay editable.
    expect(screen.getByPlaceholderText(NOTES)).not.toBeDisabled();
    expect(screen.getByDisplayValue('Net 14')).not.toBeDisabled();
    expect(screen.getByDisplayValue('PO-77')).not.toBeDisabled();
    expect((screen.getByText(/March 24th, 2026/).closest('button') as HTMLButtonElement)).not.toBeDisabled();
    // Nothing allowed was edited, so there is nothing left to save.
    expect(store.getState().hasUnsavedChanges).toBe(false);
  });

  it('also says the allowed edits are kept when one was made during the save, and the editor stays unsaved', async () => {
    renderEditor();
    const user = userEvent.setup();
    const finish = holdNextSave();
    await user.click(screen.getByText('Save and issue'));
    await waitFor(() => expect(store.getState().isSaving).toBe(true));
    await user.clear(firstQty());
    await user.type(firstQty(), '9');
    await user.type(screen.getByPlaceholderText(NOTES), '!');
    await finish(savedResult('PENDING'));

    expect(await screen.findByText(DROPPED_AND_KEPT_NOTICE)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(NOTES)).toHaveValue('a note!');
    expect(screen.getByText('Unsaved')).toBeInTheDocument();
  });

  it('once the kept edits are saved, the notice no longer says they are kept and the editor shows Saved', async () => {
    renderEditor();
    const user = userEvent.setup();
    const finishIssue = holdNextSave();
    await user.click(screen.getByText('Save and issue'));
    await waitFor(() => expect(store.getState().isSaving).toBe(true));
    await user.clear(firstQty());
    await user.type(firstQty(), '9');
    await user.type(screen.getByPlaceholderText(NOTES), '!');
    await finishIssue(savedResult('PENDING'));
    await screen.findByText(DROPPED_AND_KEPT_NOTICE);

    // Review r12 N1 (T85): the next Save leaves nothing unsaved, so the notice keeps only what was dropped.
    const finishSave = holdNextSave();
    await user.click(screen.getAllByText('Save')[0]);
    await finishSave(savedResult('PENDING'));

    expect(await screen.findByText(DROPPED_NOTICE)).toBeInTheDocument();
    expect(screen.queryByText(DROPPED_AND_KEPT_NOTICE)).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText(NOTES)).toHaveValue('a note!');
    expect(screen.getByText('Saved')).toBeInTheDocument();
  });

  it('can be dismissed, and the allowed fields can still be typed into afterwards', async () => {
    const user = await issueWithQuantityEditedMidSave();
    await screen.findByText(DROPPED_NOTICE);

    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText(DROPPED_NOTICE)).not.toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(NOTES), '!');
    expect(screen.getByPlaceholderText(NOTES)).toHaveValue('a note!');
    expect(screen.getByText('Unsaved')).toBeInTheDocument();
  });

  it('after dismissing the notice, Save carries the allowed fields and none of the dropped quantity', async () => {
    const user = await issueWithQuantityEditedMidSave();
    await screen.findByText(DROPPED_NOTICE);
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    updateInvoiceMock.mockClear();

    await user.type(screen.getByPlaceholderText(NOTES), '!');
    await user.clear(screen.getByPlaceholderText('e.g. Net 14'));
    await user.type(screen.getByPlaceholderText('e.g. Net 14'), 'Net 30');
    await user.clear(screen.getByPlaceholderText('Customer purchase order number'));
    await user.type(screen.getByPlaceholderText('Customer purchase order number'), 'PO-88');
    const finish = holdNextSave();
    await user.click(screen.getAllByText('Save')[0]);
    await finish(savedResult('PENDING'));

    await waitFor(() => expect(updateInvoiceMock).toHaveBeenCalledTimes(1));
    const [id, payload] = updateInvoiceMock.mock.calls[0];
    expect(id).toBe('inv-1');
    expect(payload).toMatchObject({ notes: 'a note!', paymentTerms: 'Net 30', poNumber: 'PO-88' });
    expect(payload.dueDate).toBeDefined();
    // The quantity typed during the issuing save was dropped: the lines are as issued.
    expect(payload.items[0].quantity).toBe(10);
  });
});
