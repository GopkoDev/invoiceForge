// @vitest-environment jsdom
// editor-ux T12 (spec.md §5 AC-06, AC-08; checklist "remove any new Date()-based default issue/due
// date in the store/factory"): the editor never computes "today" itself. A new invoice shows the day
// the server passed, even when the browser clock is on another day, and the store module no longer
// offers a clock-based default form.
import { describe, expect, it, vi, afterEach } from 'vitest';
import { screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { InvoiceEditorData } from '@/types/invoice/types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock('@/lib/actions/invoice-actions/invoice-actions', () => ({
  updateInvoice: vi.fn(),
  createInvoice: vi.fn(),
  generateInvoiceNumber: vi.fn().mockResolvedValue({ success: true, data: 'INV-NEXT' }),
  getInvoiceEditorData: vi.fn(),
}));

import { generateInvoiceNumber } from '@/lib/actions/invoice-actions/invoice-actions';
import { InvoiceDetailsSection } from '@/components/invoice-editor/invoice-details-section';
import * as storeHelpers from '@/store/invoice-editor-store/helpers';
import { createInvoiceEditorStore } from '@/store/invoice-editor-store/create-invoice-editor-store';
import { renderWithEditorStore, emptyEditorData } from '../support/render-with-editor-store';

// What the new-invoice page passes: the server's today (2026-03-11 in UTC+14) and +30 days.
function newInvoiceData(): InvoiceEditorData {
  return {
    ...emptyEditorData(),
    initialData: {
      invoiceNumber: '',
      status: 'DRAFT',
      senderProfileId: '',
      bankAccountId: '',
      customerId: '',
      issueDate: new Date('2026-03-11T00:00:00.000Z'),
      dueDate: new Date('2026-04-10T00:00:00.000Z'),
      currency: 'USD',
      poNumber: '',
      paymentTerms: '',
      items: [],
      taxRate: 0,
      discount: 0,
      shipping: 0,
      notes: '',
      terms: '',
    },
  };
}

describe('new invoice defaults come from the server (T12)', () => {
  afterEach(() => vi.useRealTimers());

  it("shows the server's issue and due day on first render while the browser clock is on another day", () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 0, 2, 12, 0, 0)); // browser says 2 Jan 2026
    renderWithEditorStore(<InvoiceDetailsSection />, { initial: newInvoiceData() });
    expect(screen.getByText('March 11th, 2026')).toBeInTheDocument();
    expect(screen.getByText('April 10th, 2026')).toBeInTheDocument();
  });

  it("builds the store's days from the passed data, not from the clock", () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 0, 2, 12, 0, 0));
    const { formData } = createInvoiceEditorStore(newInvoiceData()).getState();
    expect([formData.issueDate.getFullYear(), formData.issueDate.getMonth(), formData.issueDate.getDate()]).toEqual([
      2026, 2, 11,
    ]);
  });

  it('has no clock-based default form left in the store helpers', () => {
    expect('createInitialFormData' in storeHelpers).toBe(false);
  });
});

// editor-ux T22 (AC-06; review 2026-10-10 T-h(a)): the number hint is requested on mount for a new
// invoice that already has a sender profile, and the loading state always ends.
function withSender(): InvoiceEditorData {
  const base = newInvoiceData();
  return {
    ...base,
    senderProfiles: [
      { id: 'sp-1', name: 'Studio', legalName: null, address: null, city: null, country: null, postalCode: null, email: null, phone: null, taxId: null, logo: null, invoicePrefix: 'INV', invoiceCounter: 1 },
    ],
    bankAccounts: [
      { id: 'ba-1', senderProfileId: 'sp-1', bankName: 'Bank', accountName: 'Holder', accountNumber: '111', iban: null, swift: null, currency: 'EUR', isDefault: true },
    ],
    initialData: { ...base.initialData!, senderProfileId: 'sp-1', bankAccountId: 'ba-1', currency: 'EUR' },
  };
}
const numberInput = () => screen.getAllByRole('textbox')[0];
const gen = vi.mocked(generateInvoiceNumber);

describe('number hint on a new invoice (T22)', () => {
  it('requests the hint exactly once on mount and shows Loading until it arrives', async () => {
    gen.mockReset();
    let resolve!: (v: unknown) => void;
    gen.mockReturnValue(new Promise((r) => { resolve = r; }) as never);
    renderWithEditorStore(<InvoiceDetailsSection />, { initial: withSender() });
    await waitFor(() => expect(gen).toHaveBeenCalledTimes(1));
    expect(gen).toHaveBeenCalledWith('sp-1');
    expect(numberInput()).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    await act(async () => resolve({ success: true, data: 'INV-0042' }));
    expect(numberInput()).toHaveAttribute('placeholder', 'INV-0042');
    expect(numberInput()).not.toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    expect(gen).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['rejects', () => Promise.reject(new Error('boom'))],
    ['returns a non-success result', () => Promise.resolve({ success: false, error: 'nope', code: 'INTERNAL' })],
  ])('leaves the loading state when the request %s', async (_n, impl) => {
    gen.mockReset();
    gen.mockImplementation(impl as never);
    renderWithEditorStore(<InvoiceDetailsSection />, { initial: withSender() });
    await waitFor(() => expect(gen).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());
    expect(numberInput()).not.toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Assigned on save')).toBeInTheDocument();
  });

  // editor-ux T76 (test-plan.md edge case "the invoice-number hint never arrives"): a failed hint
  // swaps "Loading…" for "Assigned on save" in the same slot, keeps the field's box, and leaves the
  // field empty and editable.
  it.each([
    ['rejects', (settle: { reject: (e: Error) => void }) => settle.reject(new Error('boom'))],
    ['returns a non-success result', (settle: { resolve: (v: unknown) => void }) =>
      settle.resolve({ success: false, error: 'nope', code: 'FAILED' })],
  ])('keeps the field box and description slot, and the field editable, when the request %s', async (_n, finish) => {
    gen.mockReset();
    const settle = {} as { resolve: (v: unknown) => void; reject: (e: Error) => void };
    gen.mockReturnValue(new Promise((resolve, reject) => Object.assign(settle, { resolve, reject })) as never);
    renderWithEditorStore(<InvoiceDetailsSection />, { initial: withSender() });
    await waitFor(() => expect(gen).toHaveBeenCalledTimes(1));
    const inputClass = numberInput().className;
    const loadingSlot = screen.getByText('Loading…');
    const [slotTag, slotClass, slotParent] = [loadingSlot.tagName, loadingSlot.className, loadingSlot.parentElement];

    await act(async () => finish(settle as never));

    const failedSlot = screen.getByText('Assigned on save');
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
    expect(numberInput()).not.toHaveAttribute('aria-busy');
    expect(numberInput().className).toBe(inputClass);
    expect(failedSlot.tagName).toBe(slotTag);
    expect(failedSlot.className).toBe(slotClass);
    expect(failedSlot.parentElement).toBe(slotParent);
    expect(numberInput()).toHaveValue('');
    expect(numberInput()).toBeEnabled();
    await userEvent.type(numberInput(), 'INV-7');
    expect(numberInput()).toHaveValue('INV-7');
  });

  it('does not show Loading forever after the number of an existing invoice is cleared', async () => {
    gen.mockReset();
    const base = withSender();
    const existing: InvoiceEditorData = {
      ...base, invoiceId: 'inv-1', version: 1, issuedDetails: null,
      initialData: { ...base.initialData!, invoiceNumber: 'INV-0001' },
    };
    const { store } = renderWithEditorStore(<InvoiceDetailsSection />, { initial: existing, storeKey: 'test:inv-1' });
    act(() => store.getState().updateField('invoiceNumber', ''));
    await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());
    expect(numberInput()).not.toHaveAttribute('aria-busy', 'true');
  });
});
