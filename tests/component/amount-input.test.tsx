// @vitest-environment jsdom
// editor-ux T18 (AC-13): one shared AmountInput (inputMode="decimal", "." the only decimal separator)
// for line price and quantity, discount, tax rate and shipping.
// Contract chosen for "rejected": a typed "," is NOT accepted as a value. The keystroke is dropped:
// the field keeps its previous text and onChange is never called with a string containing ",".
// Marker: the rendered <input> carries data-slot="amount-input".
// AmountInput API under test: <AmountInput value={string} onChange={(raw: string) => void} {...inputProps} />.
import { readFileSync } from 'node:fs';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AmountInput } from '@/components/invoice-editor/amount-input';
import { InvoiceItemFields } from '@/components/invoice-editor/invoice-item-fields';
import type { InvoiceFormItem } from '@/types/invoice/types';

vi.mock('@/lib/actions/invoice-actions/invoice-actions', () => ({
  generateInvoiceNumber: vi.fn(),
  createInvoice: vi.fn(),
  updateInvoice: vi.fn(),
}));

const { createInvoiceEditorStore } = await import('@/store/invoice-editor-store/create-invoice-editor-store');
const { emptyEditorData } = await import('../support/render-with-editor-store');
const { withEditorStore } = await import('../support/editor-store-wrapper');
const { SummarySection } = await import('@/components/invoice-editor/summary-section');

async function loadAmountInput() {
  return AmountInput;
}

describe('AmountInput standalone (AC-13)', () => {
  async function Harness() {
    const AmountInput = await loadAmountInput();
    return function Wrapped({ onChange }: { onChange: (raw: string) => void }) {
      const [value, setValue] = useState('');
      return (
        <AmountInput
          aria-label="Amount"
          value={value}
          onChange={(raw: string) => {
            setValue(raw);
            onChange(raw);
          }}
        />
      );
    };
  }

  it('renders a text input with inputMode="decimal"', async () => {
    const Wrapped = await Harness();
    render(<Wrapped onChange={() => {}} />);
    const input = screen.getByRole('textbox', { name: 'Amount' });
    expect(input).toHaveAttribute('inputmode', 'decimal');
    expect(input).toHaveAttribute('data-slot', 'amount-input');
  });

  it('accepts "12.5"', async () => {
    const Wrapped = await Harness();
    const onChange = vi.fn();
    render(<Wrapped onChange={onChange} />);
    const input = screen.getByRole('textbox', { name: 'Amount' }) as HTMLInputElement;
    await userEvent.setup().type(input, '12.5');
    expect(input.value).toBe('12.5');
    expect(onChange).toHaveBeenLastCalledWith('12.5');
  });

  it('rejects "12,5": the comma is never accepted', async () => {
    const Wrapped = await Harness();
    const onChange = vi.fn();
    render(<Wrapped onChange={onChange} />);
    const input = screen.getByRole('textbox', { name: 'Amount' }) as HTMLInputElement;
    await userEvent.setup().type(input, '12,5');
    expect(input.value).not.toContain(',');
    for (const [raw] of onChange.mock.calls) expect(raw).not.toContain(',');
  });

  it('keeps an unfinished "12." as a draft', async () => {
    const Wrapped = await Harness();
    render(<Wrapped onChange={() => {}} />);
    const input = screen.getByRole('textbox', { name: 'Amount' }) as HTMLInputElement;
    await userEvent.setup().type(input, '12.');
    expect(input.value).toBe('12.');
  });
});

const item: InvoiceFormItem = {
  id: 'it-1',
  productId: '',
  productName: 'Item 1',
  description: '',
  quantity: 1,
  price: 10,
} as InvoiceFormItem;

describe('editor fields use AmountInput (AC-13)', () => {
  it('line price and quantity are decimal AmountInputs; "12,5" is not accepted', async () => {
    const onPrice = vi.fn();
    const onQty = vi.fn();
    const data = emptyEditorData();
    data.initialData = { ...data.initialData!, items: [item] };
    const store = createInvoiceEditorStore(data);
    render(
      <InvoiceItemFields
        item={item}
        currency="USD"
        onPriceChange={onPrice}
        onQuantityChange={onQty}
        isPriceDisabled={false}
      />,
      { wrapper: withEditorStore(store) }
    );
    const price = screen.getByRole('textbox', { name: 'Price, line 1' }) as HTMLInputElement;
    const qty = screen.getByRole('textbox', { name: 'Quantity, line 1' }) as HTMLInputElement;
    for (const el of [price, qty]) {
      expect(el).toHaveAttribute('inputmode', 'decimal');
      expect(el).toHaveAttribute('data-slot', 'amount-input');
    }
    await userEvent.setup().type(price, '{Control>}a{/Control}12,5');
    for (const [raw] of onPrice.mock.calls) expect(raw).not.toContain(',');
    expect(price.value).not.toContain(',');
  });

  it.each([
    ['Discount'],
    ['Shipping'],
    ['Tax'],
  ])('%s is a decimal AmountInput and rejects the comma', async (label) => {
    const store = createInvoiceEditorStore(emptyEditorData());
    render(<SummarySection />, { wrapper: withEditorStore(store) });
    const input = screen.getByLabelText(label) as HTMLInputElement;
    expect(input).toHaveAttribute('inputmode', 'decimal');
    expect(input).toHaveAttribute('data-slot', 'amount-input');
    await userEvent.setup().type(input, '{Control>}a{/Control}12,5');
    expect(input.value).not.toContain(',');
    const { discount, shipping, taxRate } = store.getState().formData;
    for (const v of [discount, shipping, taxRate]) expect(Number.isNaN(v)).toBe(false);
  });

  it('accepts "12.5" in the discount field and stores 12.5', async () => {
    const store = createInvoiceEditorStore(emptyEditorData());
    render(<SummarySection />, { wrapper: withEditorStore(store) });
    const input = screen.getByLabelText('Discount') as HTMLInputElement;
    await userEvent.setup().type(input, '{Control>}a{/Control}12.5');
    expect(store.getState().formData.discount).toBe(12.5);
  });
});

describe('design system registry', () => {
  it('docs/design-system.md lists AmountInput', () => {
    expect(readFileSync('docs/design-system.md', 'utf8')).toContain('AmountInput');
  });
});
