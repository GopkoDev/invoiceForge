// @vitest-environment jsdom
// editor-ux T12 (spec.md §5 AC-06, AC-08; checklist "remove any new Date()-based default issue/due
// date in the store/factory"): the editor never computes "today" itself. A new invoice shows the day
// the server passed, even when the browser clock is on another day, and the store module no longer
// offers a clock-based default form.
import { describe, expect, it, vi, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
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
