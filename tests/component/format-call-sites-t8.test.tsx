// @vitest-environment jsdom
// editor-ux T8 (AC-08, AC-09): the editor's line amounts and totals use lib/format ("$1,234.50",
// "UAH 1,234.50"), independent of device language; custom-price and paid dates keep the stored day.
// T35 (review T-a): every money case runs with en-US, uk-UA and de-DE as the default locale, and the
// dashboard's Debtors card is rendered too. Expected strings are written out, never from lib/format.
import { afterEach, describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SummarySection } from '@/components/invoice-editor/summary-section';
import { InvoiceItemFields } from '@/components/invoice-editor/invoice-item-fields';
import { InvoiceStatusBadge } from '@/components/invoices/invoice-status-badge';
import { DashboardDebtors } from '@/components/dashboard/debtors/dashboard-debtors';
import type { InvoiceFormItem } from '@/types/invoice/types';
import { DEVICE_LOCALES, stubDefaultLocale } from '../support/default-locale';

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

describe.each(DEVICE_LOCALES)('money display with a %s device language (AC-09)', (locale) => {
  beforeEach(() => {
    stubDefaultLocale(locale);
    store = createInvoiceEditorStore(emptyEditorData());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
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
  ] as const)('line total in %s reads %s', (currency, expected) => {
    render(
      <InvoiceItemFields
        item={item}
        currency={currency}
        onPriceChange={() => {}}
        onQuantityChange={() => {}}
        isPriceDisabled={false}
      />,
      { wrapper: withEditorStore(store) },
    );
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it.each([
    ['USD', '$1,234.50'],
    ['UAH', 'UAH 1,234.50'],
  ] as const)('the dashboard Debtors card shows a %s debt as %s', (currency, expected) => {
    render(
      <DashboardDebtors
        debtors={[{ customerId: 'c1', customerName: 'Globex', total: 1234.5, count: 1, currencies: [currency] }]}
      />,
    );
    const debt = screen.getByLabelText(`Total overdue: ${expected}`);
    expect(debt).toHaveTextContent(new RegExp(`^${expected.replace('$', '\\$')}$`));
  });
});

describe('dates keep the stored day (AC-08)', () => {
  it('the Paid badge shows the moment in the passed zone, en-US', () => {
    render(<InvoiceStatusBadge status="PAID" paidAt="2026-03-01T23:30:00.000Z" timeZone="Pacific/Kiritimati" />);
    expect(screen.getByText(/Mar 2, 2026/)).toBeInTheDocument();
  });
});
