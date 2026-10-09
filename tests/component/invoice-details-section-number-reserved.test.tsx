// @vitest-environment jsdom
// editor-ux T12 (spec.md §5 AC-06; sad.md §4 "The proposed invoice number stays asynchronous"): the
// invoice-number field reserves its final box from the first HTML and shows a loading state until the
// hint arrives; when it arrives only the placeholder text changes, the box does not.
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';

const state = vi.hoisted(() => ({ hint: undefined as string | undefined }));

vi.mock('@/store/invoice-editor-store', () => ({
  useInvoiceNumber: () => '',
  useInvoiceNumberHint: () => state.hint,
  useFieldErrors: () => undefined,
  useInvoiceDates: () => ({ issueDate: new Date('2026-03-11T00:00:00'), dueDate: new Date('2026-04-10T00:00:00') }),
  useInvoiceCurrency: () => 'USD',
  usePoNumber: () => '',
  useEditorLocks: () => ({ locked: false, readOnly: false }),
  useInvoiceEditorActions: () => ({ updateField: vi.fn() }),
}));

import { InvoiceDetailsSection } from '@/components/invoice-editor/invoice-details-section';

const numberField = () => screen.getAllByRole('textbox')[0] // the first text input is the invoice number;

describe('invoice number field reserves its size (T12, AC-06)', () => {
  it('is rendered in the first HTML, marked busy, before the hint arrives', () => {
    state.hint = undefined;
    const html = renderToString(<InvoiceDetailsSection />);
    expect(html).toMatch(/<input[^>]*aria-busy="true"/);
  });

  it('shows a loading state while the hint is pending and not after it arrives', () => {
    state.hint = undefined;
    const { rerender } = render(<InvoiceDetailsSection />);
    expect(numberField()).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText(/loading/i)).toBeInTheDocument();

    state.hint = 'INV-2026-0042';
    rerender(<InvoiceDetailsSection />);
    expect(numberField()).not.toHaveAttribute('aria-busy', 'true');
    expect(numberField()).toHaveAttribute('placeholder', 'INV-2026-0042');
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
  });

  it('keeps the same box (classes, tag and description slot) before and after the hint', () => {
    state.hint = undefined;
    const { rerender } = render(<InvoiceDetailsSection />);
    const before = numberField();
    const beforeClass = before.className;
    const beforeSlot = screen.getByText(/loading/i);
    const beforeSlotTag = beforeSlot.tagName;
    const beforeSlotClass = beforeSlot.className;

    state.hint = 'INV-2026-0042';
    rerender(<InvoiceDetailsSection />);
    const after = numberField();
    const afterSlot = screen.getByText('Assigned on save');
    expect(after.className).toBe(beforeClass);
    expect(afterSlot.tagName).toBe(beforeSlotTag);
    expect(afterSlot.className).toBe(beforeSlotClass);
  });
});
