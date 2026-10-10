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
import { parseDecimalDraft } from '@/hooks/use-number-draft';
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

  // Rule (spec AC-13, ux-flows K4, owner decision on review r2 N3): "." is the only decimal separator.
  // ANY change containing "," (typed or pasted) is rejected whole and the field keeps its previous value.
  // AC-13 / K4 say the comma is "not accepted"; they require no message, so the observable is: the
  // comma keystroke is dropped and onChange never receives a string containing ",".
  async function setup(initial?: string) {
    const Wrapped = await Harness();
    const onChange = vi.fn();
    render(<Wrapped onChange={onChange} />);
    const input = screen.getByRole('textbox', { name: 'Amount' }) as HTMLInputElement;
    const user = userEvent.setup();
    if (initial) await user.type(input, initial);
    return { input, onChange, user };
  }

  it('typing "12," drops the comma: the field keeps "12" and is never read as 12.5', async () => {
    const { input, onChange, user } = await setup('12');
    onChange.mockClear();
    await user.type(input, ',');
    expect(input.value).toBe('12');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('typing "12,5" key by key: the comma is ignored, so the digits are never turned into 12.5 and no raw contains ","', async () => {
    const { input, onChange, user } = await setup();
    await user.type(input, '12,5');
    // the dropped comma leaves "12"; the next keystroke "5" is a plain digit appended to it
    expect(input.value).toBe('125');
    expect(input.value).not.toBe('12.5');
    for (const [raw] of onChange.mock.calls) {
      expect(raw).not.toBe('12.5');
      expect(raw).not.toContain(',');
    }
  });

  it('typing "1,000" key by key never stores 1 or 1.000', async () => {
    const { input, onChange, user } = await setup();
    await user.type(input, '1,000');
    expect(input.value).toBe('1000');
    for (const [raw] of onChange.mock.calls) {
      expect(raw).not.toContain(',');
      expect(raw).not.toBe('1.000');
    }
    expect(onChange).not.toHaveBeenCalledWith('1.');
    expect(onChange).not.toHaveBeenCalledWith('1.0');
    expect(onChange).not.toHaveBeenCalledWith('1.000');
  });

  it('pasting "1,234.50" over "10" is rejected whole: the value stays "10"', async () => {
    const { input, onChange, user } = await setup('10');
    onChange.mockClear();
    await user.keyboard('{Control>}a{/Control}');
    await user.paste('1,234.50');
    expect(input.value).toBe('10');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('pasting "12,5" over "10" is rejected whole: the value stays "10"', async () => {
    const { input, onChange, user } = await setup('10');
    onChange.mockClear();
    await user.keyboard('{Control>}a{/Control}');
    await user.paste('12,5');
    expect(input.value).toBe('10');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('pasting "12,5" into an empty field leaves it empty', async () => {
    const { input, onChange, user } = await setup();
    await user.click(input);
    await user.paste('12,5');
    expect(input.value).toBe('');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('rejects a comma typed after a "." ("1.5," keeps "1.5")', async () => {
    const { input, onChange, user } = await setup();
    await user.type(input, '1.5,');
    expect(input.value).toBe('1.5');
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
  function renderLine() {
    const onPrice = vi.fn();
    const onQty = vi.fn();
    const data = emptyEditorData();
    data.initialData = { ...data.initialData!, items: [item] };
    const store = createInvoiceEditorStore(data);
    // A controlled parent, like the editor's row: each change is stored as a number, so the
    // field's draft keeps matching its stored value (useNumberDraft, N-01).
    function Line() {
      const [line, setLine] = useState(item);
      return (
        <InvoiceItemFields
          item={line}
          currency="USD"
          onPriceChange={(raw) => {
            onPrice(raw);
            setLine((l) => ({ ...l, price: parseDecimalDraft(raw) }));
          }}
          onQuantityChange={(raw) => {
            onQty(raw);
            setLine((l) => ({ ...l, quantity: parseDecimalDraft(raw) }));
          }}
          isPriceDisabled={false}
        />
      );
    }
    render(<Line />, { wrapper: withEditorStore(store) });
    const price = screen.getByRole('textbox', { name: 'Price, line 1' }) as HTMLInputElement;
    const qty = screen.getByRole('textbox', { name: 'Quantity, line 1' }) as HTMLInputElement;
    return { price, qty, onPrice, onQty };
  }

  it('line price and quantity are decimal AmountInputs', () => {
    const { price, qty } = renderLine();
    for (const el of [price, qty]) {
      expect(el).toHaveAttribute('inputmode', 'decimal');
      expect(el).toHaveAttribute('data-slot', 'amount-input');
    }
  });

  it.each([['price'], ['qty']] as const)('line %s: "12,5" and "1,000" typed never produce 12.5, 1 or 1.000; pasted commas keep the value', async (which) => {
    const r = renderLine();
    const el = r[which];
    const on = which === 'price' ? r.onPrice : r.onQty;
    const user = userEvent.setup();
    await user.type(el, '{Control>}a{/Control}12,5');
    for (const [raw] of on.mock.calls) {
      expect(String(raw)).not.toContain(',');
      expect(String(raw)).not.toBe('12.5');
    }
    expect(el.value).not.toBe('12.5');
    on.mockClear();
    await user.type(el, '{Control>}a{/Control}1,000');
    for (const [raw] of on.mock.calls) {
      expect(String(raw)).not.toContain(',');
      expect(['1.', '1.0', '1.00', '1.000']).not.toContain(String(raw));
    }
    // the first keystroke "1" is legitimate; the final reported value is never 1 or 1.000
    expect(String(on.mock.calls.at(-1)?.[0])).toBe('1000');
    // pastes: previous value kept, onChange silent
    const before = el.value;
    on.mockClear();
    await user.keyboard('{Control>}a{/Control}');
    await user.paste('1,234.50');
    await user.keyboard('{Control>}a{/Control}');
    await user.paste('12,5');
    expect(on).not.toHaveBeenCalled();
    expect(el.value).toBe(before);
  });

  it.each([
    ['Discount', 'discount'],
    ['Shipping', 'shipping'],
    ['Tax', 'taxRate'],
  ] as const)('%s is a decimal AmountInput that rejects every comma and stores a number', async (label, field) => {
    const store = createInvoiceEditorStore(emptyEditorData());
    render(<SummarySection />, { wrapper: withEditorStore(store) });
    const input = screen.getByLabelText(label) as HTMLInputElement;
    expect(input).toHaveAttribute('inputmode', 'decimal');
    expect(input).toHaveAttribute('data-slot', 'amount-input');
    const user = userEvent.setup();
    const stored = () => store.getState().formData[field];

    await user.type(input, '{Control>}a{/Control}12,5');
    expect(input.value).not.toContain(',');
    expect(input.value).not.toBe('12.5');
    expect(stored()).not.toBe(12.5);
    expect(Number(input.value)).toBe(stored());

    await user.type(input, '{Control>}a{/Control}1,000');
    expect(input.value).toBe('1000');
    expect(stored()).toBe(1000);

    await user.type(input, '{Control>}a{/Control}10');
    expect(input.value).toBe('10');
    expect(stored()).toBe(10);
    for (const text of ['1,234.50', '12,5']) {
      await user.keyboard('{Control>}a{/Control}');
      await user.paste(text);
      expect(input.value).toBe('10');
      expect(stored()).toBe(10);
    }
  });

  it('accepts "12.5" in the discount field and stores 12.5', async () => {
    const store = createInvoiceEditorStore(emptyEditorData());
    render(<SummarySection />, { wrapper: withEditorStore(store) });
    const input = screen.getByLabelText('Discount') as HTMLInputElement;
    await userEvent.setup().type(input, '{Control>}a{/Control}12.5');
    expect(store.getState().formData.discount).toBe(12.5);
  });
});

// AC-13 (owner decision r2 N3): a rejected comma is announced. The hint names the decimal point, is
// referenced by the input through aria-describedby, and lives in a polite aria-live region.
// Clearing rule chosen: the hint clears when the field loses focus (blur).
function expectHint(input: HTMLInputElement) {
  const hint = screen.getByText(/decimal point/i);
  expect(hint).toBeVisible();
  const ids = (input.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
  expect(ids.length).toBeGreaterThan(0);
  expect(ids.some((id) => document.getElementById(id)?.contains(hint))).toBe(true);
  const live = hint.closest('[aria-live]');
  expect(live).not.toBeNull();
  expect(live).toHaveAttribute('aria-live', 'polite');
}

describe('comma hint (AC-13)', () => {
  it('standalone: no hint before any comma; a typed comma shows the announced hint; it clears on blur', async () => {
    const Wrapped = await (async () => {
      return function W() {
        const [v, setV] = useState('');
        return <AmountInput aria-label="Amount" value={v} onChange={setV} />;
      };
    })();
    render(<Wrapped />);
    const input = screen.getByRole('textbox', { name: 'Amount' }) as HTMLInputElement;
    const user = userEvent.setup();
    await user.type(input, '12');
    expect(screen.queryByText(/decimal point/i)).toBeNull();
    await user.type(input, ',');
    expect(input.value).toBe('12');
    expectHint(input);
    await user.tab();
    expect(screen.queryByText(/decimal point/i)).toBeNull();
  });

  it('standalone: a pasted comma shows the announced hint too', async () => {
    const W = () => {
      const [v, setV] = useState('10');
      return <AmountInput aria-label="Amount" value={v} onChange={setV} />;
    };
    render(<W />);
    const input = screen.getByRole('textbox', { name: 'Amount' }) as HTMLInputElement;
    const user = userEvent.setup();
    await user.click(input);
    expect(screen.queryByText(/decimal point/i)).toBeNull();
    await user.keyboard('{Control>}a{/Control}');
    await user.paste('1,234.50');
    expect(input.value).toBe('10');
    expectHint(input);
  });

  it.each([['Discount'], ['Shipping'], ['Tax']])('%s (real store): typed comma shows the announced hint, hint clears on blur', async (label) => {
    const store = createInvoiceEditorStore(emptyEditorData());
    render(<SummarySection />, { wrapper: withEditorStore(store) });
    const input = screen.getByLabelText(label) as HTMLInputElement;
    const user = userEvent.setup();
    await user.type(input, '{Control>}a{/Control}12');
    expect(screen.queryByText(/decimal point/i)).toBeNull();
    await user.type(input, ',');
    expectHint(input);
    await user.tab();
    expect(screen.queryByText(/decimal point/i)).toBeNull();
  });
});

describe('design system registry', () => {
  it('docs/design-system.md lists AmountInput', () => {
    expect(readFileSync('docs/design-system.md', 'utf8')).toContain('AmountInput');
  });
});
