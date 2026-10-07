// @vitest-environment jsdom
// T16 — SCR-03 number field states: default-new (hint placeholder, "Assigned on save") and
// number-taken (CONFLICT FieldError). See
// docs/features/architecture-hardening/tasks/t16-editor-number-and-save-states.md
//
// InvoiceDetailsSection currently renders a static "INV-2024-0001" placeholder and a
// lock/unlock affordance with no field-error slot at all, so it does not read any hint or
// fieldErrors from the store yet — both assertions below are expected to fail until T16 wires
// them in.
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InvoiceDetailsSection } from '@/components/invoice-editor/invoice-details-section';

const updateFieldMock = vi.fn();

vi.mock('@/store/invoice-editor-store', () => ({
  useInvoiceNumber: () => '',
  useInvoiceNumberHint: () => 'INV-2026-0042',
  useFieldErrors: () => ({
    invoiceNumber: ['This invoice number is already used in this sender profile.'],
  }),
  useInvoiceDates: () => ({ issueDate: new Date('2026-01-01'), dueDate: new Date('2026-01-15') }),
  useInvoiceCurrency: () => 'USD',
  usePoNumber: () => '',
  // invoice-integrity T16: the field locks follow the editor mode (a draft here).
  useEditorLocks: () => ({ locked: false, readOnly: false }),
  useInvoiceEditorActions: () => ({ updateField: updateFieldMock }),
}));

describe('InvoiceDetailsSection — number field states (T16)', () => {
  // AC-06: empty field, hint shown only as a placeholder, "Assigned on save" description.
  it('shows the proposed number only as a placeholder and "Assigned on save" when the number field is empty', () => {
    render(<InvoiceDetailsSection />);

    const numberInput = screen.getByPlaceholderText('INV-2026-0042');
    expect(numberInput).toHaveValue('');
    expect(screen.getByText('Assigned on save')).toBeInTheDocument();
  });

  // AC-08: CONFLICT fieldErrors.invoiceNumber renders under the number field, verbatim.
  it('shows the CONFLICT message from fieldErrors.invoiceNumber under the number field', () => {
    render(<InvoiceDetailsSection />);

    expect(
      screen.getByText('This invoice number is already used in this sender profile.')
    ).toBeInTheDocument();
  });
});
