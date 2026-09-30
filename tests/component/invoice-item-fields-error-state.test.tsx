// @vitest-environment jsdom
// T16 — SCR-03 "validation": a VALIDATION fieldErrors entry for an item's price renders as a
// FieldError under that line's price input, keyed by the item's index in the submitted array
// (contracts/server-actions.md, AC-14/AC-15).
// See docs/features/architecture-hardening/tasks/t16-editor-number-and-save-states.md
//
// InvoiceItemFields today reads no store state at all and renders no error slot for price or
// quantity, so this assertion is expected to fail until T16 wires fieldErrors in.
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InvoiceItemFields } from '@/components/invoice-editor/invoice-item-fields';
import type { InvoiceFormItem } from '@/types/invoice/types';

const item: InvoiceFormItem = {
  id: 'item-1',
  productId: 'custom',
  productName: 'Item',
  description: '',
  unit: 'pcs',
  quantity: 1,
  price: -5,
  total: -5,
};

vi.mock('@/store/invoice-editor-store', () => ({
  useFieldErrors: () => ({
    'items.0.price': ["Price can't be negative."],
  }),
  useInvoiceItems: () => [item],
}));

describe('InvoiceItemFields — price fieldError (T16)', () => {
  it("shows the VALIDATION message under the price field when items.<index>.price has a fieldError", () => {
    render(
      <InvoiceItemFields
        item={item}
        currency="USD"
        onPriceChange={() => {}}
        onQuantityChange={() => {}}
        isPriceDisabled={false}
      />
    );

    expect(screen.getByText("Price can't be negative.")).toBeInTheDocument();
  });
});
