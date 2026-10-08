// @vitest-environment jsdom
// invoice-integrity T24 (spec.md §5 AC-11 amended, AC-12; review F4) — the editor derives the invoice
// currency from the chosen bank account; a catalogue line in another currency is refused on its line,
// and a legacy draft stored with mismatching currencies is refused on the bank account field.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import type { InvoiceEditorData, InvoiceFormData } from '@/types/invoice/types';

const { updateInvoiceMock, createInvoiceMock, toastError } = vi.hoisted(() => ({
  updateInvoiceMock: vi.fn(),
  createInvoiceMock: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: toastError, warning: vi.fn() } }));
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

// jsdom has no ResizeObserver; cmdk (the bank account picker) needs one. Test-scaffold stub only.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);
// jsdom has no Element.getAnimations (Base UI popup/scroll area); same scaffold-only stub.
Element.prototype.getAnimations = () => [];
Element.prototype.scrollIntoView = () => {};

const { InvoiceEditor } = await import('@/components/invoice-editor/invoice-editor');
const { useInvoiceEditorStore } = await import('@/store/invoice-editor-store');

function data(bankAccountId: string, currency: 'EUR' | 'USD'): InvoiceEditorData {
  const initialData: InvoiceFormData = {
    invoiceNumber: 'INV-2026-0042',
    status: 'DRAFT',
    senderProfileId: 'sp-1',
    bankAccountId,
    customerId: 'cu-1',
    issueDate: new Date('2026-03-10T00:00:00.000Z'),
    dueDate: new Date('2026-03-24T00:00:00.000Z'),
    currency,
    poNumber: '',
    paymentTerms: 'Net 14',
    items: [
      { id: 'it-1', productId: 'pr-eur', productName: 'Design EUR', description: '', unit: 'h', quantity: 1, price: 100, total: 100 },
    ],
    taxRate: 0,
    discount: 0,
    shipping: 0,
    notes: 'a note',
    terms: '',
  };
  return {
    senderProfiles: [
      { id: 'sp-1', name: 'Current Studio', legalName: null, address: null, city: null, country: null, postalCode: null, email: null, phone: null, taxId: null, logo: null, invoicePrefix: 'INV', invoiceCounter: 42 },
    ],
    bankAccounts: [
      { id: 'ba-eur', senderProfileId: 'sp-1', bankName: 'Euro Bank', accountName: 'Holder', accountNumber: '111', iban: null, swift: null, currency: 'EUR', isDefault: true },
      { id: 'ba-usd', senderProfileId: 'sp-1', bankName: 'Dollar Bank', accountName: 'Holder', accountNumber: '222', iban: null, swift: null, currency: 'USD', isDefault: false },
    ],
    customers: [
      { id: 'cu-1', name: 'Current Customer', companyName: null, email: null, address: null, city: null, country: null, postalCode: null, phone: null, taxId: null, defaultCurrency: 'EUR' },
    ],
    products: [{ id: 'pr-eur', name: 'Design EUR', description: null, unit: 'h', price: 100, currency: 'EUR', isActive: true }],
    customPrices: [],
    initialData,
    invoiceId: 'inv-1',
    version: 3,
    issuedDetails: null,
  };
}

const currencyInput = () => screen.getByDisplayValue(/^(EUR|USD)$/) as HTMLInputElement;

async function save(user: ReturnType<typeof userEvent.setup>) {
  await act(async () => {
    await user.click(screen.getAllByText('Save')[0]);
  });
}

beforeEach(() => {
  for (const m of [updateInvoiceMock, createInvoiceMock, toastError]) m.mockReset();
  useInvoiceEditorStore.getState().reset();
});

describe('InvoiceEditor account-driven currency (T24)', () => {
  it('picking a USD bank account on a EUR draft sets the invoice currency; a EUR catalogue line is refused on its line (AC-11 amended, AC-12)', async () => {
    const lineMessage = '“Design EUR” is priced in EUR while the invoice is in USD.';
    updateInvoiceMock.mockResolvedValue({
      success: false,
      code: 'VALIDATION',
      error: 'Please fix the highlighted fields.',
      fieldErrors: { 'items.0.productId': [lineMessage] },
    });
    const user = userEvent.setup();
    render(<InvoiceEditor data={data('ba-eur', 'EUR')} />);
    expect(currencyInput().value).toBe('EUR');

    await user.click(screen.getByText('Euro Bank (EUR)'));
    await user.click(await screen.findByText('Dollar Bank (USD)', { selector: 'span' }));

    expect(currencyInput().value).toBe('USD');
    expect(useInvoiceEditorStore.getState().formData.currency).toBe('USD');

    await save(user);

    expect(updateInvoiceMock).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(updateInvoiceMock.mock.calls[0])).toContain('"currency":"USD"');
    expect((await screen.findAllByText(lineMessage)).length).toBeGreaterThan(0);
    expect(toastError).not.toHaveBeenCalled();
  });

  it('a legacy draft stored in EUR with a USD account shows the AC-11 refusal under the bank account select after save', async () => {
    const accountMessage = 'This account is in USD while the invoice is in EUR.';
    updateInvoiceMock.mockResolvedValue({
      success: false,
      code: 'VALIDATION',
      error: 'Please fix the highlighted fields.',
      fieldErrors: { bankAccountId: [accountMessage] },
    });
    const user = userEvent.setup();
    render(<InvoiceEditor data={data('ba-usd', 'EUR')} />);
    // Loaded as stored: the editor does not silently rewrite the legacy currency.
    expect(useInvoiceEditorStore.getState().formData.currency).toBe('EUR');
    expect(screen.getByText('Dollar Bank (USD)')).toBeInTheDocument();

    // Save is only live once something changed; edit a neutral field, not the account or currency.
    await user.type(screen.getByPlaceholderText('Additional information for the client...'), ' edited');
    await save(user);

    expect(JSON.stringify(updateInvoiceMock.mock.calls[0])).toContain('"currency":"EUR"');
    const message = await screen.findByText(accountMessage);
    const field = screen.getByText('Dollar Bank (USD)').closest('div.space-y-2') as HTMLElement;
    expect(within(field).getByText(accountMessage)).toBe(message);
    expect(toastError).not.toHaveBeenCalled();
  });
});
