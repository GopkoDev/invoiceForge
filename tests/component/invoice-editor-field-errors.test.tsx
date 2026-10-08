// @vitest-environment jsdom
// invoice-integrity T17 (spec.md §5 AC-09, AC-11, AC-12, AC-14, AC-19, AC-20b; screens.md SCR-02
// validation states) — every new rule refusal renders under its field, verbatim, with the edits kept
// and no toast fallback; an ISSUED_INVOICE_LOCKED refusal shows a destructive Alert above the form; a
// STATUS_NOT_ALLOWED refusal is a toast.
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
/** The element rendered right after the summary row that carries `label` (the row's own FieldError). */
function belowRow(label: string): Element {
  let row: HTMLElement | null = screen.getByText(label, { selector: 'span, label' });
  while (row && row.parentElement && !row.parentElement.classList.contains('space-y-4') && !row.parentElement.classList.contains('space-y-3')) {
    row = row.parentElement;
  }
  return row!.nextElementSibling!;
}

beforeEach(() => {
  for (const m of [updateInvoiceMock, createInvoiceMock, toastSuccess, toastError]) m.mockReset();
  useInvoiceEditorStore.getState().reset();
});


const MSG = {
  bankAccountId: 'This account is in USD while the invoice is in EUR.',
  productId: '“Consulting 2025” is priced in USD while the invoice is in EUR.',
  lineTotal: "The line amount can't exceed 99,999,999.99.",
  shipping: "Shipping can't exceed 99,999,999.99.",
  subtotal: "The subtotal can't exceed 99,999,999.99.",
  taxAmount: "The tax amount can't exceed 99,999,999.99.",
  total: "The total can't exceed 99,999,999.99.",
  discount: "Discount can't exceed the subtotal plus shipping.",
  dueDate: "The due date can't be before the issue date (10 Mar 2026).",
};
const LOCKED_ERROR =
  'An issued invoice can only change its due date, notes, payment terms and PO number. To correct anything else, cancel it and duplicate it.';

async function editNotesAndSave() {
  const user = userEvent.setup();
  await user.type(byPlaceholder('Additional information for the client...'), ' edited');
  await act(async () => {
    await user.click(screen.getAllByText('Save')[0]);
  });
  return user;
}

describe('InvoiceEditor field errors (T17)', () => {
  it('a draft refusal with every rule key renders each message under its field, verbatim, no toast fallback', async () => {
    updateInvoiceMock.mockResolvedValue({
      success: false,
      code: 'VALIDATION',
      error: 'Please fix the highlighted fields.',
      fieldErrors: {
        bankAccountId: [MSG.bankAccountId],
        'items.0.productId': [MSG.productId],
        'items.1.total': [MSG.lineTotal],
        shipping: [MSG.shipping],
        subtotal: [MSG.subtotal],
        taxAmount: [MSG.taxAmount],
        total: [MSG.total],
        discount: [MSG.discount],
        dueDate: [MSG.dueDate],
      },
    });
    renderEditor(data('DRAFT'));
    await editNotesAndSave();

    // Each message sits inside its own field's container, not just somewhere on the page.
    const dueDateField = triggerOf(/March 24th, 2026/).parentElement as HTMLElement;
    expect(await within(dueDateField).findByText(MSG.dueDate)).toBeInTheDocument();
    const bankField = triggerOf(/Current Bank \(USD\)/).parentElement as HTMLElement;
    expect(within(bankField).getByText(MSG.bankAccountId)).toBeInTheDocument();
    const productField = screen.getByText('Consulting 2025').closest('.min-w-0') as HTMLElement;
    expect(within(productField).getByText(MSG.productId)).toBeInTheDocument();
    const lineTotal = screen.getByText('300.00 USD');
    expect(within(lineTotal).getByText(MSG.lineTotal)).toBeInTheDocument();
    expect(belowRow('Subtotal')).toHaveTextContent(MSG.subtotal);
    expect(belowRow('Discount')).toHaveTextContent(MSG.discount);
    expect(belowRow('Shipping')).toHaveTextContent(MSG.shipping);
    expect(belowRow('Tax')).toHaveTextContent(MSG.taxAmount);
    expect(belowRow('Total')).toHaveTextContent(MSG.total);
    // Each message appears once: nothing is duplicated elsewhere.
    for (const message of Object.values(MSG)) expect(screen.getAllByText(message), message).toHaveLength(1);
    // The due date, bank account and line product triggers are marked invalid for assistive tech.
    expect(triggerOf(/March 24th, 2026/)).toHaveAttribute('aria-invalid', 'true');
    expect(triggerOf(/Current Bank \(USD\)/)).toHaveAttribute('aria-invalid', 'true');
    expect((screen.getByText('Consulting 2025').closest('button') as HTMLButtonElement)).toHaveAttribute('aria-invalid', 'true');
    expect(toastError).not.toHaveBeenCalled();
    // Edits are kept.
    expect(byPlaceholder('Additional information for the client...')).toHaveValue('a note edited');
  });

  // T37 (review r2 L2): each picker is named by its label first, then its value, so a screen
  // reader announces the field and the e2e tests find it by name.
  it('the issue date, due date and bank account pickers are named by their labels', () => {
    renderEditor(data('DRAFT'));
    expect(screen.getByRole('button', { name: /^Issue Date\b.*March 10th, 2026/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Due Date\b.*March 24th, 2026/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Bank Account\b.*Current Bank \(USD\)/ })).toBeInTheDocument();
  });

  it('an issued due-date refusal shows under the due date (AC-09)', async () => {
    updateInvoiceMock.mockResolvedValue({
      success: false,
      code: 'VALIDATION',
      error: 'Please fix the highlighted fields.',
      fieldErrors: { dueDate: [MSG.dueDate] },
    });
    renderEditor(data('PENDING'));
    await editNotesAndSave();
    const dueDateField = triggerOf(/March 24th, 2026/).parentElement as HTMLElement;
    expect(await within(dueDateField).findByText(MSG.dueDate)).toBeInTheDocument();
    expect(triggerOf(/March 24th, 2026/)).toHaveAttribute('aria-invalid', 'true');
    expect(toastError).not.toHaveBeenCalled();
  });

  it('ISSUED_INVOICE_LOCKED shows the destructive Alert; rendered keys under their fields, the rest toasted', async () => {
    updateInvoiceMock.mockResolvedValue({
      success: false,
      code: 'VALIDATION',
      error: LOCKED_ERROR,
      fieldErrors: {
        discount: ["This field can't change on an issued invoice."],
        items: ["This field can't change on an issued invoice."],
      },
      details: { kind: 'ISSUED_INVOICE_LOCKED' },
    });
    renderEditor(data('PENDING'));
    await editNotesAndSave();
    expect(await screen.findByText(LOCKED_ERROR)).toBeInTheDocument();
    expect(belowRow('Discount')).toHaveTextContent("This field can't change on an issued invoice.");
    expect(toastError).toHaveBeenCalledWith("This field can't change on an issued invoice.");
  });

  it('STATUS_NOT_ALLOWED on save is a toast with the error verbatim; edits kept', async () => {
    updateInvoiceMock.mockResolvedValue({
      success: false,
      code: 'VALIDATION',
      error: "A cancelled invoice is final and can't be changed. Duplicate it to make a new draft.",
      details: { kind: 'STATUS_NOT_ALLOWED', currentStatus: 'CANCELLED', suggestion: 'DUPLICATE' },
    });
    renderEditor(data('PENDING'));
    await editNotesAndSave();
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "A cancelled invoice is final and can't be changed. Duplicate it to make a new draft."
      )
    );
    expect(byPlaceholder('Additional information for the client...')).toHaveValue('a note edited');
  });

  it('the next save clears the locked Alert', async () => {
    updateInvoiceMock.mockResolvedValueOnce({
      success: false,
      code: 'VALIDATION',
      error: LOCKED_ERROR,
      fieldErrors: { items: ["This field can't change on an issued invoice."] },
      details: { kind: 'ISSUED_INVOICE_LOCKED' },
    });
    updateInvoiceMock.mockResolvedValueOnce({
      success: true,
      data: {
        id: 'inv-1', invoiceNumber: 'INV-2026-0042', subtotal: 1800, taxAmount: 0, total: 1800, status: 'PENDING',
        derivedOverdue: false, paidAt: null, issueDate: '2026-03-10T00:00:00.000Z', dueDate: '2026-03-24T00:00:00.000Z', version: 4,
      },
    });
    renderEditor(data('PENDING'));
    const user = await editNotesAndSave();
    expect(await screen.findByText(LOCKED_ERROR)).toBeInTheDocument();
    await act(async () => {
      await user.click(screen.getAllByText('Save')[0]);
    });
    await waitFor(() => expect(screen.queryByText(LOCKED_ERROR)).not.toBeInTheDocument());
  });
});
