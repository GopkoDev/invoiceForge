// @vitest-environment jsdom
// editor-ux T8 (AC-08, AC-09): the editor's line amounts and totals use lib/format ("$1,234.50",
// "UAH 1,234.50"), independent of device language; custom-price and paid dates keep the stored day.
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SummarySection } from '@/components/invoice-editor/summary-section';
import { InvoiceItemFields } from '@/components/invoice-editor/invoice-item-fields';
import { InvoiceStatusBadge } from '@/components/invoices/invoice-status-badge';
import type { InvoiceFormItem } from '@/types/invoice/types';

vi.mock('@/lib/actions/invoice-actions/invoice-actions', () => ({
  generateInvoiceNumber: vi.fn(),
  createInvoice: vi.fn(),
  updateInvoice: vi.fn(),
}));

const { createInvoiceEditorStore } = await import('@/store/invoice-editor-store/create-invoice-editor-store');
const { emptyEditorData } = await import('../support/render-with-editor-store');
const { withEditorStore } = await import('../support/editor-store-wrapper');
let store: ReturnType<typeof createInvoiceEditorStore> = createInvoiceEditorStore(emptyEditorData());

const item: InvoiceFormItem = {
  id: 'i1',
  productId: 'p1',
  productName: 'Work',
  description: '',
  unit: 'h',
  quantity: 1,
  price: 1234.5,
  total: 1234.5,
};

const setCurrency = (currency: 'USD' | 'UAH') =>
  store.setState((s) => ({
    formData: { ...s.formData, currency },
    invoiceCurrency: currency,
    subtotal: 1234.5,
    taxAmount: 0,
    total: 1234.5,
  }));

describe('editor money display (AC-09)', () => {
  beforeEach(() => {
    store = createInvoiceEditorStore(emptyEditorData());
  });

  it.each([
    ['USD', '$1,234.50'],
    ['UAH', 'UAH 1,234.50'],
  ] as const)('summary totals in %s read %s', (currency, expected) => {
    setCurrency(currency);
    render(<SummarySection />, { wrapper: withEditorStore(store) });
    expect(screen.getAllByText(expected).length).toBeGreaterThanOrEqual(2);
  });

  it.each([
    ['USD', '$1,234.50'],
    ['UAH', 'UAH 1,234.50'],
  ] as const)('line total in %s reads %s (desktop and mobile)', (currency, expected) => {
    for (const layout of ['desktop', 'mobile'] as const) {
      const { unmount } = render(
        <InvoiceItemFields
          item={item}
          currency={currency}
          onPriceChange={() => {}}
          onQuantityChange={() => {}}
          isPriceDisabled={false}
          layout={layout}
        />,
        { wrapper: withEditorStore(store) },
      );
      expect(screen.getByText(expected)).toBeInTheDocument();
      unmount();
    }
  });
});

describe('dates keep the stored day (AC-08)', () => {
  it('the Paid badge shows the moment in the passed zone, en-US', () => {
    render(<InvoiceStatusBadge status="PAID" paidAt="2026-03-01T23:30:00.000Z" timeZone="Pacific/Kiritimati" />);
    expect(screen.getByText(/Mar 2, 2026/)).toBeInTheDocument();
  });
});
