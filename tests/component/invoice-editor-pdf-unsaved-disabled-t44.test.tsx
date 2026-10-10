// @vitest-environment jsdom
// editor-ux T44 (spec.md AC-09; test-plan.md row 74; review 2026-10-10 r2 T-l): Download and Print in
// the editor are disabled while there are unsaved changes, so the PDF can only ever print the last
// save (invoice-integrity AC-02), and they are enabled again once the save has gone through. The real
// useInvoicePdf runs under the real per-mount store; only the server actions are faked.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { InvoiceEditorData, InvoiceFormData } from '@/types/invoice/types';

const { updateInvoiceMock } = vi.hoisted(() => ({ updateInvoiceMock: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), dismiss: vi.fn() } }));
vi.mock('@/lib/actions/invoice-actions/invoice-actions', () => ({
  updateInvoice: updateInvoiceMock,
  createInvoice: vi.fn(),
  generateInvoiceNumber: vi.fn().mockResolvedValue({ success: true, data: 'INV-2026-0043' }),
  getInvoiceEditorData: vi.fn(),
}));
vi.mock('@/lib/pdf/load-pdf-kit', () => ({ loadPdfKit: () => Promise.resolve({}) }));

const { InvoiceEditorHeader } = await import('@/components/invoice-editor/invoice-editor-header');
const { renderWithEditorStore } = await import('../support/render-with-editor-store');

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
    poNumber: '',
    paymentTerms: '',
    items: [
      { id: 'it-1', productId: 'custom', productName: 'Consulting', description: '', unit: 'h', quantity: 10, price: 150, total: 1500 },
    ],
    taxRate: 0,
    discount: 0,
    shipping: 0,
    notes: '',
    terms: '',
  };
  return {
    senderProfiles: [
      { id: 'sp-1', name: 'Studio', legalName: null, address: null, city: null, country: null, postalCode: null, email: null, phone: null, taxId: null, logo: null, invoicePrefix: 'INV', invoiceCounter: 42 },
    ],
    bankAccounts: [
      { id: 'ba-1', senderProfileId: 'sp-1', bankName: 'Bank', accountName: 'Holder', accountNumber: '999', iban: null, swift: null, currency: 'USD', isDefault: true },
    ],
    customers: [
      { id: 'cu-1', name: 'Customer', companyName: null, email: null, address: null, city: null, country: null, postalCode: null, phone: null, taxId: null, defaultCurrency: 'USD' },
    ],
    products: [],
    customPrices: [],
    initialData,
    invoiceId: 'inv-1',
    version: 3,
    issuedDetails: null,
  } as InvoiceEditorData;
}

const savedResult = {
  success: true,
  data: {
    id: 'inv-1', invoiceNumber: 'INV-2026-0042', subtotal: 1200, taxAmount: 0, total: 1200, status: 'DRAFT',
    derivedOverdue: false, paidAt: null, issueDate: '2026-03-10T00:00:00.000Z', dueDate: '2026-03-24T00:00:00.000Z',
    version: 4, issuedDetails: null,
  },
};

beforeEach(() => updateInvoiceMock.mockReset());

describe('AC-09: Download and Print follow the last save', () => {
  it('are enabled on an untouched invoice, disabled after an edit, and enabled again after the save', async () => {
    const { store } = renderWithEditorStore(<InvoiceEditorHeader />, { initial: data() });
    const user = userEvent.setup();
    const download = () => screen.getByRole('button', { name: /Download/ });
    const print = () => screen.getByRole('button', { name: /Print/ });

    expect(download()).toBeEnabled();
    expect(print()).toBeEnabled();

    act(() => {
      const [item] = store.getState().formData.items;
      store.getState().updateFields({ items: [{ ...item, quantity: 8, total: 1200 }] });
    });
    expect(store.getState().hasUnsavedChanges).toBe(true);
    expect(download()).toBeDisabled();
    expect(print()).toBeDisabled();

    updateInvoiceMock.mockResolvedValueOnce(savedResult);
    await user.click(screen.getAllByText('Save')[0]);

    await waitFor(() => expect(store.getState().hasUnsavedChanges).toBe(false));
    expect(download()).toBeEnabled();
    expect(print()).toBeEnabled();
  });
});
