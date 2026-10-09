// @vitest-environment jsdom
// editor-ux T14 (RED) — the editor's dialog host (InvoiceEditorModalContainer) shows the
// changed-elsewhere (SCR-10) and totals-confirmation (SCR-09) dialogs from store state, so a save
// started anywhere, including a toast's Retry, reaches them (AC-05d, sad §3). No header hook is
// mounted: only the store and the host.
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ok, fail } from '@/types/actions';
import type { InvoiceEditorData } from '@/types/invoice/types';

const createInvoiceMock = vi.fn();
const updateInvoiceMock = vi.fn();
vi.mock('@/lib/actions/invoice-actions/invoice-actions', () => ({
  generateInvoiceNumber: vi.fn(),
  getInvoiceEditorData: vi.fn(),
  createInvoice: (...a: unknown[]) => createInvoiceMock(...a),
  updateInvoice: (...a: unknown[]) => updateInvoiceMock(...a),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}));
type ToastOpts = { action?: { label: string; onClick: () => void } };
const toastError = vi.fn<(m: string, o?: ToastOpts) => void>();
vi.mock('sonner', () => ({
  toast: { error: (m: string, o?: ToastOpts) => toastError(m, o), success: vi.fn() },
}));

const { renderWithEditorStore, emptyEditorData } = await import('../support/render-with-editor-store');
const { InvoiceEditorModalContainer } = await import(
  '@/components/modals/invoice-editor/invoice-editor-modal-container'
);
const { useModalStore } = await import('@/store/use-modal-store');

type Cmd = { save: (i: 'save' | 'save-and-issue', o?: unknown) => Promise<void> };
const existing = () =>
  ({ ...emptyEditorData(), invoiceId: 'inv-1', version: 3 }) as InvoiceEditorData;

async function failThenRetry(retriedAnswer: unknown) {
  const view = renderWithEditorStore(<InvoiceEditorModalContainer />, { initial: existing() });
  updateInvoiceMock.mockResolvedValueOnce(fail('FAILED', 'Could not reach the server.'));
  await act(async () => {
    await (view.store.getState() as unknown as Cmd).save('save');
  });
  updateInvoiceMock.mockResolvedValueOnce(retriedAnswer);
  const call = [...toastError.mock.calls].reverse().find(([, o]) => o?.action?.label === 'Retry')!;
  await act(async () => {
    call[1]!.action!.onClick();
  });
  return view;
}

beforeEach(() => {
  createInvoiceMock.mockReset();
  updateInvoiceMock.mockReset();
  toastError.mockReset();
  useModalStore.getState().resetAllModals();
});

describe('dialog host, reached by Retry (AC-05d)', () => {
  it('shows the changed-elsewhere dialog after a retried save is refused as changed elsewhere', async () => {
    await failThenRetry(
      fail('CONFLICT', 'Edited in another tab.', { details: { kind: 'CHANGED_ELSEWHERE' } } as never)
    );
    expect(await screen.findByText('This invoice changed elsewhere')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reload invoice' })).toBeTruthy();
  });

  it('shows the totals confirmation after a retried save is answered with changed totals, and confirming saves with the confirmed figures', async () => {
    await failThenRetry(
      fail('CONFLICT', 'Total changes.', {
        details: { kind: 'TOTALS_CHANGED', oldTotal: '10.00', newTotal: '11.00' },
      } as never)
    );
    expect(await screen.findByText('Confirm the new total')).toBeTruthy();
    updateInvoiceMock.mockResolvedValueOnce(
      ok({ id: 'inv-1', version: 4, status: 'DRAFT', subtotal: 0, taxAmount: 0, total: 0,
        invoiceNumber: 'INV-1', derivedOverdue: false, paidAt: null, issuedDetails: null,
        issueDate: '2026-03-11T00:00:00.000Z', dueDate: '2026-04-10T00:00:00.000Z' })
    );
    await userEvent.click(screen.getByRole('button', { name: 'Confirm and save' }));
    await waitFor(() =>
      expect(updateInvoiceMock).toHaveBeenLastCalledWith(
        'inv-1',
        expect.objectContaining({ confirmedTotals: { oldTotal: '10.00', newTotal: '11.00' } })
      )
    );
  });

  it('cancelling the totals confirmation saves nothing and keeps the edits unsaved', async () => {
    const view = await failThenRetry(
      fail('CONFLICT', 'Total changes.', {
        details: { kind: 'TOTALS_CHANGED', oldTotal: '10.00', newTotal: '11.00' },
      } as never)
    );
    await screen.findByText('Confirm the new total');
    const calls = updateInvoiceMock.mock.calls.length;
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(updateInvoiceMock.mock.calls.length).toBe(calls);
    expect(view.store.getState().totalsChanged).toBeNull();
    expect(view.store.getState().hasUnsavedChanges).toBe(true);
  });
});
