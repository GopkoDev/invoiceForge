// @vitest-environment jsdom
// invoice-integrity T18 (spec.md §5 AC-10; screens.md SCR-05, SCR-02 saved/changed-elsewhere/stale;
// ADR-0004) — the editor sends the version it loaded and adopts the saved one; a CHANGED_ELSEWHERE
// refusal opens SCR-05 with the error verbatim; Reload re-initialises the editor from the current
// invoice in its current status's mode; Close leaves a stale Alert with Reload, and any save re-opens
// SCR-05.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import type { InvoiceEditorData, InvoiceFormData } from '@/types/invoice/types';

const { updateInvoiceMock, createInvoiceMock, toastSuccess, toastError, editorDataMock, refreshMock } = vi.hoisted(
  () => ({
    updateInvoiceMock: vi.fn(),
    createInvoiceMock: vi.fn(),
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
    editorDataMock: vi.fn(),
    refreshMock: vi.fn(),
  })
);

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: refreshMock, replace: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: toastError, warning: vi.fn() } }));
vi.mock('@/lib/actions/invoice-actions/invoice-actions', () => ({
  updateInvoice: updateInvoiceMock,
  createInvoice: createInvoiceMock,
  generateInvoiceNumber: vi.fn().mockResolvedValue({ success: true, data: 'INV-2026-0043' }),
  getInvoiceEditorData: editorDataMock,
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

beforeEach(() => {
  for (const m of [updateInvoiceMock, createInvoiceMock, toastSuccess, toastError, editorDataMock, refreshMock]) m.mockReset();
  useInvoiceEditorStore.getState().reset();
});


const CHANGED = 'This invoice was changed elsewhere after you opened it. Reload it to see the latest version.';
const STALE = 'This invoice was changed elsewhere. Reload it to continue.';
/** The dialog's footer Close (the corner X also reads "Close" to screen readers). */
const footerClose = () =>
  screen.getAllByRole('button', { name: 'Close' }).find((b) => b.querySelector('svg') === null)!;

function saved(version: number, status = 'DRAFT') {
  return {
    success: true,
    data: {
      id: 'inv-1', invoiceNumber: 'INV-2026-0042', subtotal: 1800, taxAmount: 0, total: 1800, status,
      derivedOverdue: false, paidAt: null, issueDate: '2026-03-10T00:00:00.000Z', dueDate: '2026-03-24T00:00:00.000Z', version,
    },
  };
}
const conflict = { success: false, code: 'CONFLICT', error: CHANGED, details: { kind: 'CHANGED_ELSEWHERE', currentVersion: 4 } };

async function typeNoteAndSave(user: ReturnType<typeof userEvent.setup>, text = ' x') {
  await user.type(byPlaceholder('Additional information for the client...'), text);
  await act(async () => {
    await user.click(screen.getAllByText('Save')[0]);
  });
}

describe('InvoiceEditor — loaded version and changed elsewhere (T18)', () => {
  it('sends the loaded version and adopts the saved one for the next save', async () => {
    updateInvoiceMock.mockResolvedValueOnce(saved(4)).mockResolvedValueOnce(saved(5));
    renderEditor(data('DRAFT'));
    const user = userEvent.setup();
    await typeNoteAndSave(user);
    await typeNoteAndSave(user, ' y');
    expect(updateInvoiceMock.mock.calls[0][1]).toMatchObject({ loadedVersion: 3 });
    expect(updateInvoiceMock.mock.calls[1][1]).toMatchObject({ loadedVersion: 4 });
  });

  it('CHANGED_ELSEWHERE opens SCR-05 with the error verbatim; nothing else is toasted', async () => {
    updateInvoiceMock.mockResolvedValue(conflict);
    renderEditor(data('PENDING'));
    await typeNoteAndSave(userEvent.setup());
    expect(await screen.findByText('This invoice changed elsewhere')).toBeInTheDocument();
    expect(screen.getByText(CHANGED)).toBeInTheDocument();
    expect(screen.getByText('Reloading discards your unsaved changes.')).toBeInTheDocument();
    expect(screen.getByText('Reload invoice')).toBeInTheDocument();
    expect(footerClose()).toBeInTheDocument();
    expect(toastError).not.toHaveBeenCalled();
  });

  it('Reload re-initialises from the current invoice: a pending invoice paid elsewhere reopens as paid, in issued mode', async () => {
    updateInvoiceMock.mockResolvedValue(conflict);
    const current = data('PAID', { version: 4 });
    editorDataMock.mockResolvedValue({ success: true, data: current });
    renderEditor(data('PENDING'));
    const user = userEvent.setup();
    await typeNoteAndSave(user);
    await user.click(await screen.findByText('Reload invoice'));

    await waitFor(() => expect(screen.queryByText('This invoice changed elsewhere')).not.toBeInTheDocument());
    expect(editorDataMock).toHaveBeenCalledWith('inv-1');
    expect(screen.getByText('Paid')).toBeInTheDocument();
    expect(byPlaceholder('Additional information for the client...')).toHaveValue('a note');
    expect(useInvoiceEditorStore.getState().hasUnsavedChanges).toBe(false);
    // The next save carries the reloaded version.
    updateInvoiceMock.mockResolvedValue(saved(5, 'PAID'));
    await typeNoteAndSave(user, ' z');
    expect(updateInvoiceMock.mock.calls.at(-1)?.[1]).toMatchObject({ loadedVersion: 4 });
  });

  it('Close leaves the stale Alert with Reload; a further save re-opens SCR-05', async () => {
    updateInvoiceMock.mockResolvedValue(conflict);
    renderEditor(data('DRAFT'));
    const user = userEvent.setup();
    await typeNoteAndSave(user);
    await screen.findByText('This invoice changed elsewhere');
    await user.click(footerClose());
    expect(await screen.findByText(STALE)).toBeInTheDocument();
    expect(screen.getByText('Reload')).toBeInTheDocument();
    // Edits are still on screen.
    expect(byPlaceholder('Additional information for the client...')).toHaveValue('a note x');

    await act(async () => {
      await user.click(screen.getAllByText('Save')[0]);
    });
    expect(await screen.findByText('This invoice changed elsewhere')).toBeInTheDocument();
  });

  it('Reload of an invoice deleted elsewhere refreshes into the not-found page', async () => {
    updateInvoiceMock.mockResolvedValue(conflict);
    editorDataMock.mockResolvedValue({ success: true, data: { ...data(null), invoiceId: 'inv-1' } });
    renderEditor(data('DRAFT'));
    const user = userEvent.setup();
    await typeNoteAndSave(user);
    await user.click(await screen.findByText('Reload invoice'));
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it('a failed reload shows the load error with Try again', async () => {
    updateInvoiceMock.mockResolvedValue(conflict);
    editorDataMock.mockResolvedValue({ success: false, code: 'FAILED', error: 'Failed to fetch invoice editor data.' });
    renderEditor(data('DRAFT'));
    const user = userEvent.setup();
    await typeNoteAndSave(user);
    await user.click(await screen.findByText('Reload invoice'));
    expect(await screen.findByText('Try again')).toBeInTheDocument();
  });

  it('TOTALS_CHANGED still opens the totals confirmation, not SCR-05', async () => {
    updateInvoiceMock.mockResolvedValue({
      success: false,
      code: 'CONFLICT',
      error: 'The total of this invoice changes from 1.00 to 2.00. Confirm to save.',
      details: { kind: 'TOTALS_CHANGED', oldTotal: '1.00', newTotal: '2.00' },
    });
    renderEditor(data('DRAFT'));
    await typeNoteAndSave(userEvent.setup());
    expect(await screen.findByText('Confirm the new total')).toBeInTheDocument();
    expect(screen.queryByText('This invoice changed elsewhere')).not.toBeInTheDocument();
  });
});
