// @vitest-environment jsdom
// T41 — N-01 (docs/features/architecture-hardening/_review/review-2026-09-28.md, AC-14): the
// editor number inputs were bound to a number and stored `Number(value)` on every keystroke, so
// "-5" and "abc" displayed "NaN" and "1.5" became 15. The inputs must keep the raw text as typed
// (spec.md §3 "the entered value is never silently corrected"). Typed keystroke by keystroke with
// userEvent.type — a single change event misses the mid-edit re-render.
//
// RED (N-01 not yet fixed): the input's value is `String(Number(draft))`, e.g. "NaN" for "-".
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SummarySection } from '@/components/invoice-editor/summary-section';
import { InvoiceItemFields } from '@/components/invoice-editor/invoice-item-fields';
import { useInvoiceItemHandlers } from '@/hooks/use-invoice-item-handlers';

vi.mock('@/lib/actions/invoice-actions/invoice-actions', () => ({
  generateInvoiceNumber: vi.fn(),
  createInvoice: vi.fn(),
  updateInvoice: vi.fn(),
}));

const { useInvoiceEditorStore } = await import(
  '@/store/invoice-editor-store/use-invoice-editor-store'
);

function ItemHarness({ itemId, layout }: { itemId: string; layout?: 'desktop' | 'mobile' }) {
  const { item, currency, handlePriceChange, handleQuantityChange } = useInvoiceItemHandlers({
    itemId,
  });
  return (
    <InvoiceItemFields
      item={item}
      currency={currency}
      onPriceChange={handlePriceChange}
      onQuantityChange={handleQuantityChange}
      isPriceDisabled={false}
      layout={layout}
    />
  );
}

describe('SummarySection number inputs keep the raw draft (N-01)', () => {
  beforeEach(() => {
    useInvoiceEditorStore.getState().reset();
  });

  it.each([
    ['discount', 0, '-5'],
    ['shipping', 1, 'abc'],
    ['taxRate', 2, '1.5'],
  ] as const)('%s shows exactly what was typed (%s)', async (field, index, typed) => {
    const user = userEvent.setup();
    render(<SummarySection />);
    const input = screen.getAllByRole('textbox')[index] as HTMLInputElement;

    await user.clear(input);
    await user.type(input, typed);

    expect(input.value).toBe(typed);
    const stored = useInvoiceEditorStore.getState().formData[field];
    expect(Object.is(stored, Number(typed))).toBe(true);
  });

  it('a trailing decimal point survives while typing "1.5" (not 15)', async () => {
    const user = userEvent.setup();
    render(<SummarySection />);
    const input = screen.getAllByRole('textbox')[0] as HTMLInputElement;

    await user.clear(input);
    await user.type(input, '1.');
    expect(input.value).toBe('1.');
    await user.type(input, '5');

    expect(input.value).toBe('1.5');
    expect(useInvoiceEditorStore.getState().formData.discount).toBe(1.5);
  });
});

describe('InvoiceItemFields number inputs keep the raw draft (N-01)', () => {
  beforeEach(() => {
    useInvoiceEditorStore.getState().reset();
    useInvoiceEditorStore.getState().addCustomItem();
  });

  it.each(['desktop', 'mobile'] as const)(
    '%s: price "-5" and quantity "abc" show as typed',
    async (layout) => {
      const user = userEvent.setup();
      const itemId = useInvoiceEditorStore.getState().formData.items[0].id;
      render(<ItemHarness itemId={itemId} layout={layout} />);
      const [price, quantity] = screen.getAllByRole('textbox') as HTMLInputElement[];

      await user.clear(price);
      await user.type(price, '-5');
      await user.clear(quantity);
      await user.type(quantity, 'abc');

      expect(price.value).toBe('-5');
      expect(quantity.value).toBe('abc');
    }
  );

  it('quantity "1.5" keeps its decimal point while typing', async () => {
    const user = userEvent.setup();
    const itemId = useInvoiceEditorStore.getState().formData.items[0].id;
    render(<ItemHarness itemId={itemId} />);
    const quantity = screen.getAllByRole('textbox')[1] as HTMLInputElement;

    await user.clear(quantity);
    await user.type(quantity, '1.5');

    expect(quantity.value).toBe('1.5');
    expect(useInvoiceEditorStore.getState().formData.items[0].quantity).toBe(1.5);
  });

  it('a store-side change (product pick) replaces a stale draft', async () => {
    const user = userEvent.setup();
    const itemId = useInvoiceEditorStore.getState().formData.items[0].id;
    render(<ItemHarness itemId={itemId} />);
    const price = screen.getAllByRole('textbox')[0] as HTMLInputElement;

    await user.clear(price);
    await user.type(price, '12');
    act(() => useInvoiceEditorStore.getState().updateItem(itemId, { price: 99 }));

    expect(price.value).toBe('99');
  });
});
