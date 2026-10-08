// @vitest-environment jsdom
// invoice-integrity T16 (spec.md §5 AC-06, AC-07, AC-08, AC-15, AC-16; screens.md SCR-02) — the editor's
// mode follows the stored status: a new invoice saves only; a saved draft is fully editable with
// Save and Save and issue; an issued invoice (pending, overdue, paid) edits only the due date, notes,
// payment terms and PO number and shows its issued details as text under a permanent info Alert; a
// cancelled invoice is read-only with Save hidden. Retired-product lines are shown as saved and never
// flagged for removal.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
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
vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: toastError, warning: vi.fn() } }));
vi.mock('@/lib/actions/invoice-actions/invoice-actions', () => ({
  updateInvoice: updateInvoiceMock,
  createInvoice: createInvoiceMock,
  generateInvoiceNumber: vi.fn().mockResolvedValue({ success: true, data: 'INV-2026-0043' }),
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

// jsdom has no ResizeObserver / getAnimations / scrollIntoView (cmdk and Base UI). Scaffold-only stubs.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);
Element.prototype.getAnimations = () => [];
Element.prototype.scrollIntoView = () => {};

const { InvoiceEditor } = await import('@/components/invoice-editor/invoice-editor');
const { useInvoiceEditorStore } = await import('@/store/invoice-editor-store');

const ISSUED_ALERT =
  'This invoice is issued. You can change only the due date, notes, payment terms and PO number. To correct anything else, cancel it and duplicate it.';
const CANCELLED_ALERT = "A cancelled invoice is final and can't be changed. Duplicate it to make a new draft.";

function data(status: InvoiceFormData['status'] | null, over: Partial<InvoiceEditorData> = {}): InvoiceEditorData {
  const initialData: InvoiceFormData | undefined = status
    ? {
        invoiceNumber: 'INV-2026-0042',
        status,
        senderProfileId: 'sp-1',
        bankAccountId: 'ba-1',
        customerId: 'cu-1',
        issueDate: new Date('2026-03-10T00:00:00.000Z'),
        dueDate: new Date('2026-03-24T00:00:00.000Z'),
        currency: 'USD',
        poNumber: 'PO-77',
        paymentTerms: 'Net 14',
        items: [
          { id: 'it-1', productId: 'pr-retired', productName: 'Consulting 2025', description: '', unit: 'h', quantity: 10, price: 150, total: 1500 },
          { id: 'it-2', productId: '', productName: 'Old workshop', description: '', unit: 'pcs', quantity: 1, price: 300, total: 300 },
        ],
        taxRate: 0,
        discount: 0,
        shipping: 0,
        notes: 'a note',
        terms: 'Pay by transfer',
      }
    : undefined;
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
    products: [
      { id: 'pr-active', name: 'Design', description: null, unit: 'h', price: 100, currency: 'USD', isActive: true },
      { id: 'pr-retired', name: 'Consulting 2025', description: null, unit: 'h', price: 150, currency: 'USD', isActive: false },
    ],
    customPrices: [],
    initialData,
    invoiceId: status ? 'inv-1' : undefined,
    version: status ? 3 : undefined,
    issuedDetails: status
      ? {
          sender: { name: 'Issued Studio', legalName: 'Old Legal Name Ltd', taxId: null, address: 'Old Street 1', city: null, country: null, postalCode: null, phone: null, email: null, website: null },
          customer: { name: 'Acme', companyName: null, taxId: null, email: null, phone: null, address: 'Old Road 2', city: null, country: null, postalCode: null },
          bank: { bankName: 'Bank X', accountName: 'Holder', accountNumber: '123', iban: 'UA21 OLD', swift: null },
        }
      : null,
    ...over,
  };
}

function renderEditor(d: InvoiceEditorData) {
  return render(<InvoiceEditor data={d} />);
}

const byPlaceholder = (text: string) => screen.getByPlaceholderText(text);
const triggerOf = (text: RegExp) => screen.getByText(text).closest('button') as HTMLButtonElement;

beforeEach(() => {
  for (const m of [updateInvoiceMock, createInvoiceMock, toastSuccess, toastError]) m.mockReset();
  useInvoiceEditorStore.getState().reset();
});

describe('InvoiceEditor modes (T16, SCR-02)', () => {
  it('a new invoice offers Save only, no Save and issue (AC-04b)', () => {
    renderEditor(data(null));
    expect(screen.getAllByText('Save').length).toBeGreaterThan(0);
    expect(screen.queryByText('Save and issue')).not.toBeInTheDocument();
  });

  it('a saved draft is fully editable with Save and Save and issue; retired lines show as saved, nothing flagged', () => {
    renderEditor(data('DRAFT'));
    expect(screen.getByText('Save and issue')).toBeInTheDocument();
    expect(screen.getByDisplayValue('INV-2026-0042')).not.toBeDisabled();
    expect(screen.getByText('From List')).toBeInTheDocument();
    expect(screen.queryByText(ISSUED_ALERT)).not.toBeInTheDocument();
    // AC-15 / AC-16: the deactivated product's line and the deleted product's line, as saved.
    expect(screen.getByText('Consulting 2025')).toBeInTheDocument();
    expect(screen.getByText('Old workshop')).toBeInTheDocument();
    expect(screen.queryByText(/Invalid Items/)).not.toBeInTheDocument();
    expect(screen.queryByText(/will be removed when you save/)).not.toBeInTheDocument();
  });

  it('the add-line picker offers active products only; the inactive "Consulting 2025" is not offered but its existing line stays (AC-15)', async () => {
    renderEditor(data('DRAFT'));
    const user = userEvent.setup();
    await user.click(screen.getByText('From List'));
    await user.click(await screen.findByText('Select product...'));
    const picker = await screen.findByRole('listbox');
    expect(within(picker).getByText('Design')).toBeInTheDocument();
    expect(within(picker).queryByText('Consulting 2025')).not.toBeInTheDocument();
    // The saved line keeps showing the retired product.
    expect(screen.getByText('Consulting 2025')).toBeInTheDocument();
  });

  it.each(['PENDING', 'OVERDUE', 'PAID'] as const)(
    'an issued (%s) invoice edits only the due date, notes, payment terms and PO number',
    (status) => {
      renderEditor(data(status));
      expect(screen.getByText(ISSUED_ALERT)).toBeInTheDocument();
      expect(screen.queryByText('Save and issue')).not.toBeInTheDocument();

      // Editable.
      expect(triggerOf(/March 24th, 2026/)).not.toBeDisabled();
      expect(byPlaceholder('Additional information for the client...')).not.toBeDisabled();
      expect(screen.getByDisplayValue('Net 14')).not.toBeDisabled();
      expect(screen.getByDisplayValue('PO-77')).not.toBeDisabled();
      // Locked.
      expect(screen.getByDisplayValue('INV-2026-0042')).toBeDisabled();
      expect(triggerOf(/March 10th, 2026/)).toBeDisabled();
      expect(screen.getByDisplayValue('Pay by transfer')).toBeDisabled();
      for (const input of screen.getAllByPlaceholderText('Qty')) expect(input).toBeDisabled();
      expect(screen.queryByText('From List')).not.toBeInTheDocument();
      expect(screen.queryByText('Custom Item')).not.toBeInTheDocument();
      expect(screen.queryByTitle('Delete')).not.toBeInTheDocument();

      // AC-01: the sender, Customer and bank blocks show the issued details, not a picker.
      expect(screen.getByText('Old Legal Name Ltd')).toBeInTheDocument();
      expect(screen.getByText('Old Road 2')).toBeInTheDocument();
      expect(screen.getByText(/123/)).toBeInTheDocument();
      expect(screen.queryByText('Current Customer')).not.toBeInTheDocument();
    }
  );

  it('a cancelled invoice is read-only, Save hidden, Download and Print kept (AC-06)', () => {
    renderEditor(data('CANCELLED'));
    expect(screen.getByText(CANCELLED_ALERT)).toBeInTheDocument();
    expect(screen.queryByText('Save')).not.toBeInTheDocument();
    expect(screen.getByText('Download')).toBeInTheDocument();
    expect(screen.getByText('Print')).toBeInTheDocument();
    expect(triggerOf(/March 24th, 2026/)).toBeDisabled();
    expect(byPlaceholder('Additional information for the client...')).toBeDisabled();
    expect(screen.getByDisplayValue('Net 14')).toBeDisabled();
    expect(screen.getByDisplayValue('PO-77')).toBeDisabled();
  });

  it('Save and issue sends PENDING; on success it toasts "Invoice issued" and switches to issued in place', async () => {
    updateInvoiceMock.mockResolvedValue({
      success: true,
      data: {
        id: 'inv-1',
        invoiceNumber: 'INV-2026-0042',
        subtotal: 1800,
        taxAmount: 0,
        total: 1800,
        status: 'PENDING',
        derivedOverdue: false,
        paidAt: null,
        issueDate: '2026-03-10T00:00:00.000Z',
        dueDate: '2026-03-24T00:00:00.000Z',
        version: 4,
      },
    });
    renderEditor(data('DRAFT'));
    // A saved draft with no edits: Save and issue is still available.
    const user = userEvent.setup();
    await user.click(screen.getByText('Save and issue'));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Invoice issued'));
    expect(updateInvoiceMock.mock.calls[0][1]).toMatchObject({ status: 'PENDING' });
    expect(await screen.findByText(ISSUED_ALERT)).toBeInTheDocument();
    expect(screen.getByDisplayValue('INV-2026-0042')).toBeDisabled();
  });

  const FROZEN = {
    sender: { name: 'Frozen Studio', legalName: 'Frozen Legal Ltd', taxId: null, address: 'Frozen Street 9', city: null, country: null, postalCode: null, phone: null, email: null, website: null },
    customer: { name: 'Frozen Customer', companyName: null, taxId: null, email: null, phone: null, address: 'Frozen Road 7', city: null, country: null, postalCode: null },
    bank: { bankName: 'Frozen Bank', accountName: 'Holder', accountNumber: '777', iban: 'UA21 NEW', swift: null },
  };
  const issuedResult = (over: Record<string, unknown> = {}) => ({
    success: true,
    data: {
      id: 'inv-1',
      invoiceNumber: 'INV-2026-0042',
      subtotal: 1800,
      taxAmount: 0,
      total: 1800,
      status: 'PENDING',
      derivedOverdue: false,
      paidAt: null,
      issueDate: '2026-03-10T00:00:00.000Z',
      dueDate: '2026-03-24T00:00:00.000Z',
      version: 4,
      issuedDetails: FROZEN,
      ...over,
    },
  });

  it('after Save and issue the From, To and bank blocks and the PDF parties show the details the server froze (AC-01, AC-02)', async () => {
    updateInvoiceMock.mockResolvedValue(issuedResult());
    renderEditor(data('DRAFT'));
    const user = userEvent.setup();
    await user.click(screen.getByText('Save and issue'));
    expect(await screen.findByText(ISSUED_ALERT)).toBeInTheDocument();

    expect(screen.getByText('Frozen Legal Ltd')).toBeInTheDocument();
    expect(screen.getByText('Frozen Street 9')).toBeInTheDocument();
    expect(screen.getByText('Frozen Road 7')).toBeInTheDocument();
    expect(screen.getByText('Frozen Bank')).toBeInTheDocument();
    expect(screen.queryByText('Old Legal Name Ltd')).not.toBeInTheDocument();
    expect(screen.queryByText('Old Road 2')).not.toBeInTheDocument();

    const { renderHook } = await import('@testing-library/react');
    const { usePdfParties } = await import('@/store/invoice-editor-store/pdf-parties');
    const { result } = renderHook(() => usePdfParties());
    expect(result.current.senderProfile?.address).toBe('Frozen Street 9');
    expect(result.current.customer?.address).toBe('Frozen Road 7');
    expect(result.current.bankAccount?.bankName).toBe('Frozen Bank');
  });

  it('a new invoice saved and then issued in the same session shows text blocks, no sender, Customer or bank picker (AC-01, AC-03)', async () => {
    createInvoiceMock.mockResolvedValue(
      issuedResult({ status: 'DRAFT', issuedDetails: null, version: 0 })
    );
    updateInvoiceMock.mockResolvedValue(issuedResult({ version: 1 }));
    renderEditor(data(null));
    useInvoiceEditorStore.getState().updateFields({
      senderProfileId: 'sp-1',
      bankAccountId: 'ba-1',
      customerId: 'cu-1',
    });
    await act(async () => {
      await useInvoiceEditorStore.getState().saveInvoice();
    });
    expect(createInvoiceMock).toHaveBeenCalled();
    expect(screen.getAllByText('Current Customer').length).toBeGreaterThan(0); // still a draft: pickers stay
    await act(async () => {
      await useInvoiceEditorStore.getState().saveInvoice({ issue: true });
    });
    expect(await screen.findByText(ISSUED_ALERT)).toBeInTheDocument();
    expect(screen.getByText('Frozen Legal Ltd')).toBeInTheDocument();
    expect(screen.getByText('Frozen Road 7')).toBeInTheDocument();
    expect(screen.getByText('Frozen Bank')).toBeInTheDocument();
    expect(screen.queryByText('Current Customer')).not.toBeInTheDocument();
    expect(screen.queryByText('Current Studio')).not.toBeInTheDocument();
    expect(screen.queryByText('Select customer...')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('combobox')).toHaveLength(0);
  });

  it('a failed Save and issue leaves the invoice a draft', async () => {
    updateInvoiceMock.mockResolvedValue({
      success: false,
      code: 'VALIDATION',
      error: 'Please fix the highlighted fields.',
      fieldErrors: { bankAccountId: ['This account is in USD while the invoice is in EUR.'] },
    });
    renderEditor(data('DRAFT'));
    const user = userEvent.setup();
    await act(async () => {
      await user.click(screen.getByText('Save and issue'));
    });
    expect(screen.queryByText(ISSUED_ALERT)).not.toBeInTheDocument();
    expect(useInvoiceEditorStore.getState().formData.status).toBe('DRAFT');
    expect(within(document.body).getByText('Save and issue')).toBeInTheDocument();
  });
});
