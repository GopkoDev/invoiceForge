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

const { createInvoiceEditorStore } = await import('@/store/invoice-editor-store/create-invoice-editor-store');
const { emptyEditorData } = await import('../support/render-with-editor-store');
const { withEditorStore } = await import('../support/editor-store-wrapper');
let store: ReturnType<typeof createInvoiceEditorStore> = createInvoiceEditorStore(emptyEditorData());

function ItemHarness({ itemId }: { itemId: string }) {
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
    />
  );
}

describe('SummarySection number inputs keep the raw draft (N-01)', () => {
  beforeEach(() => {
    store = createInvoiceEditorStore(emptyEditorData());
  });

  it.each([
    ['discount', 0, '-5'],
    ['shipping', 1, 'abc'],
    ['taxRate', 2, '1.5'],
  ] as const)('%s shows exactly what was typed (%s)', async (field, index, typed) => {
    const user = userEvent.setup();
    render(<SummarySection />, { wrapper: withEditorStore(store) });
    const input = screen.getAllByRole('textbox')[index] as HTMLInputElement;

    await user.clear(input);
    await user.type(input, typed);

    expect(input.value).toBe(typed);
    const stored = store.getState().formData[field];
    expect(Object.is(stored, Number(typed))).toBe(true);
  });

  it('a trailing decimal point survives while typing "1.5" (not 15)', async () => {
    const user = userEvent.setup();
    render(<SummarySection />, { wrapper: withEditorStore(store) });
    const input = screen.getAllByRole('textbox')[0] as HTMLInputElement;

    await user.clear(input);
    await user.type(input, '1.');
    expect(input.value).toBe('1.');
    await user.type(input, '5');

    expect(input.value).toBe('1.5');
    expect(store.getState().formData.discount).toBe(1.5);
  });
});

describe('InvoiceItemFields number inputs keep the raw draft (N-01)', () => {
  beforeEach(() => {
    store = createInvoiceEditorStore(emptyEditorData());
    store.getState().addCustomItem();
  });

  it.each(['one tree for both layouts'])(
    '%s: price "-5" and quantity "abc" show as typed',
    async () => {
      const user = userEvent.setup();
      const itemId = store.getState().formData.items[0].id;
      render(<ItemHarness itemId={itemId} />, { wrapper: withEditorStore(store) });
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
    const itemId = store.getState().formData.items[0].id;
    render(<ItemHarness itemId={itemId} />, { wrapper: withEditorStore(store) });
    const quantity = screen.getAllByRole('textbox')[1] as HTMLInputElement;

    await user.clear(quantity);
    await user.type(quantity, '1.5');

    expect(quantity.value).toBe('1.5');
    expect(store.getState().formData.items[0].quantity).toBe(1.5);
  });

  it('a store-side change (product pick) replaces a stale draft', async () => {
    const user = userEvent.setup();
    const itemId = store.getState().formData.items[0].id;
    render(<ItemHarness itemId={itemId} />, { wrapper: withEditorStore(store) });
    const price = screen.getAllByRole('textbox')[0] as HTMLInputElement;

    await user.clear(price);
    await user.type(price, '12');
    act(() => store.getState().updateItem(itemId, { price: 99 }));

    expect(price.value).toBe('99');
  });
});
