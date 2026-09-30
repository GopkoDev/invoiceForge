// @vitest-environment jsdom
// T51 — R-14 (review-2026-09-30, AC-14): the editor stored Number(raw), so "0x10" became 16,
// "1e3" became 1000 and empty/whitespace input became 0 — a silent rewrite. Strict decimal
// parsing must turn them into NaN so the schema says "... must be a number.". R-15 (AC-12/17):
// contracts/server-actions.md §duplicateInvoice must document the FAILED refusal.
import { readFileSync } from 'node:fs';
import { invoiceItemSchema } from '@/lib/validations/invoice';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SummarySection } from '@/components/invoice-editor/summary-section';
import { InvoiceItemFields } from '@/components/invoice-editor/invoice-item-fields';
import { parseDecimalDraft } from '@/hooks/use-number-draft';
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


describe('parseDecimalDraft trims surrounding whitespace (S-08)', () => {
  it.each([
    [' 5', 5],
    ['5 ', 5],
    [' -1.5 ', -1.5],
  ])('%j parses to %d', (raw, expected) => {
    expect(parseDecimalDraft(raw)).toBe(expected);
  });

  it.each([[' '], ['   '], [''], ['5 5'], [' 0x10 ']])('%j stays NaN', (raw) => {
    expect(parseDecimalDraft(raw)).toBeNaN();
  });
});

describe('SummarySection keeps whitespace-padded numbers (S-08)', () => {
  beforeEach(() => useInvoiceEditorStore.getState().reset());

  it.each([[' 5'], ['5 ']])('typing %j into discount stores 5', async (typed) => {
    const user = userEvent.setup();
    render(<SummarySection />);
    const input = screen.getAllByRole('textbox')[0] as HTMLInputElement;
    await user.clear(input);
    await user.type(input, typed);
    expect(input.value).toBe(typed);
    expect(useInvoiceEditorStore.getState().formData.discount).toBe(5);
  });
});

const NAN_CASES = [['0x10'], ['1e3'], [' ']] as const;

describe('SummarySection rejects non-decimal drafts (R-14)', () => {
  beforeEach(() => useInvoiceEditorStore.getState().reset());

  it.each([
    ['discount', 0],
    ['shipping', 1],
    ['taxRate', 2],
  ] as const)('%s: 0x10, 1e3 and whitespace store NaN', async (field, index) => {
    for (const [typed] of NAN_CASES) {
      const user = userEvent.setup();
      const { unmount } = render(<SummarySection />);
      const input = screen.getAllByRole('textbox')[index] as HTMLInputElement;
      await user.clear(input);
      await user.type(input, typed);
      expect(input.value).toBe(typed);
      expect(useInvoiceEditorStore.getState().formData[field]).toBeNaN();
      unmount();
    }
  });

  it('an emptied discount stores NaN, not 0', async () => {
    const user = userEvent.setup();
    render(<SummarySection />);
    const input = screen.getAllByRole('textbox')[0] as HTMLInputElement;
    await user.clear(input);
    expect(useInvoiceEditorStore.getState().formData.discount).toBeNaN();
  });
});

describe('InvoiceItemFields rejects non-decimal drafts (R-14)', () => {
  beforeEach(() => {
    useInvoiceEditorStore.getState().reset();
    useInvoiceEditorStore.getState().addCustomItem();
  });

  it('price "0x10" and quantity "1e3" store NaN and the schema says must be a number', async () => {
    const user = userEvent.setup();
    const itemId = useInvoiceEditorStore.getState().formData.items[0].id;
    render(<ItemHarness itemId={itemId} />);
    const [price, quantity] = screen.getAllByRole('textbox') as HTMLInputElement[];

    await user.clear(price);
    await user.type(price, '0x10');
    await user.clear(quantity);
    await user.type(quantity, '1e3');

    const item = useInvoiceEditorStore.getState().formData.items[0];
    expect(item.price).toBeNaN();
    expect(item.quantity).toBeNaN();
    const res = invoiceItemSchema.safeParse(item);
    const messages = res.success ? [] : res.error.issues.map((i) => i.message);
    expect(messages.some((m) => /must be a number/i.test(m))).toBe(true);
  });

  it('an empty price stores NaN, not 0', async () => {
    const user = userEvent.setup();
    const itemId = useInvoiceEditorStore.getState().formData.items[0].id;
    render(<ItemHarness itemId={itemId} />);
    const price = screen.getAllByRole('textbox')[0] as HTMLInputElement;

    await user.clear(price);

    expect(useInvoiceEditorStore.getState().formData.items[0].price).toBeNaN();
  });
});

describe('contract documents the duplicate refusal (R-15)', () => {
  it('§duplicateInvoice lists FAILED with message, no retry and reporting rule', () => {
    const md = readFileSync(
      'docs/features/architecture-hardening/contracts/server-actions.md',
      'utf8'
    );
    const start = md.indexOf('### `duplicateInvoice');
    const section = md.slice(start, md.indexOf('\n### ', start + 5));
    expect(section).toMatch(/FAILED/);
    expect(section).toMatch(/can't be duplicated/);
    expect(section).toMatch(/no retry/i);
    expect(section).toMatch(/Sentry|report/i);
  });
});
