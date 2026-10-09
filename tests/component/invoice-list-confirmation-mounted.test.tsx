// @vitest-environment jsdom
// invoice-integrity T32 follow-up (SCR-04, AC-06): Cancel Invoice on the invoices list and on the
// dashboard's recent invoices opens the shared confirmationModal, so the route's modal container
// must render it. Found by tests/e2e/invoice-integrity/us03-status-lifecycle.spec.ts.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { InvoiceModalContainer } from '@/components/modals/invoice/invoice-modal-container';
import { DashboardModalContainer } from '@/components/modals/dashboard/dashboard-modal-container';
import { useModalStore } from '@/store/use-modal-store';

afterEach(() => {
  act(() => useModalStore.getState().resetAllModals());
});

describe.each([
  ['the invoices list', InvoiceModalContainer],
  ['the dashboard', DashboardModalContainer],
])('the modal container on %s', (_where, Container) => {
  it('renders the confirmation dialog the row menu opens', async () => {
    render(<Container />);

    act(() => {
      useModalStore.getState().openModal('confirmationModal', {
        open: true,
        title: 'Cancel invoice INV-2026-0001?',
        description: 'A cancelled invoice cannot be edited.',
        onClose: vi.fn(),
        onConfirm: vi.fn(),
      });
    });

    expect(await screen.findByRole('dialog')).toHaveTextContent(
      'Cancel invoice INV-2026-0001?'
    );
  });
});
