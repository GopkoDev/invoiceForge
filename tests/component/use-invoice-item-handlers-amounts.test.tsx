// @vitest-environment jsdom
// T32 — F-01/F-04 (docs/features/architecture-hardening/_review/review-2026-09-27.md, Group 1):
// useInvoiceItemHandlers computed each line's total with `price * quantity` float math instead
// of the shared exact-decimal module, so the editor could show a different total than what the
// server stores for the exact same line (AC-13). Its quantity/price onChange handlers also
// silently rewrote the entered value — stripping "-" and letters before parsing, and defaulting
// an unparseable value to 0 — instead of letting the schema reject it (AC-14, spec.md §3 "the
// entered value is never silently corrected").
//
// RED (F-01/F-04 not yet fixed): handleProductSelect/handleQuantityChange/handlePriceChange in
// hooks/use-invoice-item-handlers.ts compute `total: price * item.quantity` and sanitize with
// `value.replace(/[^\d.]/g, '')` before `parseFloat(...) || 0`.
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useInvoiceItemHandlers } from '@/hooks/use-invoice-item-handlers';
import { lineAmount } from '@/lib/helpers/invoice-calculations';

// This suite drives the store's item mutations directly (updateItem/addCustomItem); it never
// calls saveInvoice, so the real server-action module (which needs DATABASE_URL) is mocked out,
// same seam as invoice-editor-store-save-states.test.tsx.
vi.mock('@/lib/actions/invoice-actions/invoice-actions', () => ({
  generateInvoiceNumber: vi.fn(),
  createInvoice: vi.fn(),
  updateInvoice: vi.fn(),
}));

const { useInvoiceEditorStore } = await import(
  '@/store/invoice-editor-store/use-invoice-editor-store'
);

describe('useInvoiceItemHandlers (F-01, shared line totals)', () => {
  beforeEach(() => {
    useInvoiceEditorStore.getState().reset();
    useInvoiceEditorStore.getState().addCustomItem();
  });

  function firstItemId() {
    return useInvoiceEditorStore.getState().formData.items[0].id;
  }

  it('handlePriceChange totals the line with the shared exact-decimal module, not float multiply', () => {
    const itemId = firstItemId();
    useInvoiceEditorStore.getState().updateItem(itemId, { quantity: 0.5 });

    const { result } = renderHook(() => useInvoiceItemHandlers({ itemId }));

    act(() => {
      result.current.handlePriceChange('2.01');
    });

    const item = useInvoiceEditorStore.getState().formData.items[0];
    // 0.5 x 2.01 as a naive float multiply renders 1.00 (float drift); the shared module rounds
    // the exact product half-up to 1.01, matching what the server stores (AC-13).
    expect(item.total).toBe(Number(lineAmount(0.5, 2.01)));
    expect(item.total).toBe(1.01);
  });

  it('handleQuantityChange totals the line with the shared exact-decimal module', () => {
    const itemId = firstItemId();
    useInvoiceEditorStore.getState().updateItem(itemId, { price: 2.01 });

    const { result } = renderHook(() => useInvoiceItemHandlers({ itemId }));

    act(() => {
      result.current.handleQuantityChange('0.5');
    });

    const item = useInvoiceEditorStore.getState().formData.items[0];
    expect(item.total).toBe(1.01);
  });
});

describe('useInvoiceItemHandlers (F-04, no silent rewrites)', () => {
  beforeEach(() => {
    useInvoiceEditorStore.getState().reset();
    useInvoiceEditorStore.getState().addCustomItem();
  });

  function firstItemId() {
    return useInvoiceEditorStore.getState().formData.items[0].id;
  }

  it('keeps a negative price entry as negative instead of stripping the "-" sign', () => {
    const itemId = firstItemId();
    const { result } = renderHook(() => useInvoiceItemHandlers({ itemId }));

    act(() => {
      result.current.handlePriceChange('-5');
    });

    const item = useInvoiceEditorStore.getState().formData.items[0];
    expect(item.price).toBe(-5);
  });

  it('keeps a non-numeric quantity entry instead of silently defaulting it to 0', () => {
    const itemId = firstItemId();
    const { result } = renderHook(() => useInvoiceItemHandlers({ itemId }));

    act(() => {
      result.current.handleQuantityChange('abc');
    });

    const item = useInvoiceEditorStore.getState().formData.items[0];
    expect(Number.isNaN(item.quantity)).toBe(true);
  });
});
