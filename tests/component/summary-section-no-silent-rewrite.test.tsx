// @vitest-environment jsdom
// T32 — F-04 (docs/features/architecture-hardening/_review/review-2026-09-27.md, Group 1):
// SummarySection's handleNumericChange stripped "-" (and letters) with
// `value.replace(/[^\d.]/g, '')` before `parseFloat(...) || 0`, silently rewriting a negative
// discount/shipping/tax-rate entry into a positive one instead of letting the schema reject it
// (spec.md §3 "the entered value is never silently corrected").
//
// RED (F-04 not yet fixed): handleNumericChange strips the "-" before parsing, so typing "-1"
// into Discount stores 1, not -1.
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SummarySection } from '@/components/invoice-editor/summary-section';

vi.mock('@/lib/actions/invoice-actions/invoice-actions', () => ({
  generateInvoiceNumber: vi.fn(),
  createInvoice: vi.fn(),
  updateInvoice: vi.fn(),
}));

const { createInvoiceEditorStore } = await import('@/store/invoice-editor-store/create-invoice-editor-store');
const { emptyEditorData } = await import('../support/render-with-editor-store');
const { withEditorStore } = await import('../support/editor-store-wrapper');
let store: ReturnType<typeof createInvoiceEditorStore> = createInvoiceEditorStore(emptyEditorData());

describe('SummarySection (F-04, no silent rewrites)', () => {
  beforeEach(() => {
    store = createInvoiceEditorStore(emptyEditorData());
  });

  it('keeps a negative discount entry as negative instead of stripping the "-" sign', () => {
    render(<SummarySection />, { wrapper: withEditorStore(store) });

    // Discount, Shipping and Tax rate are all plain text inputs with no accessible name wired to
    // them; Discount renders first in the DOM. A single change event (rather than
    // keystroke-by-keystroke typing) exercises the handler without depending on how a
    // number-valued controlled input re-renders mid-edit, which is orthogonal to this finding.
    const discountInput = screen.getAllByRole('textbox')[0];
    fireEvent.change(discountInput, { target: { value: '-1' } });

    expect(store.getState().formData.discount).toBe(-1);
  });
});
