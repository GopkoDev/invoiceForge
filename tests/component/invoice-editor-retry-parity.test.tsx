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
  toast: { error: (m: string, o?: ToastOpts) => toastError(m, o), success: vi.fn(), dismiss: vi.fn() },
}));

const { renderWithEditorStore, emptyEditorData } = await import('../support/render-with-editor-store');
const { InvoiceEditorModalContainer } = await import(
  '@/components/modals/invoice-editor/invoice-editor-modal-container'
);
const { useModalStore } = await import('@/store/use-modal-store');

type Cmd = { save: (i: 'save' | 'save-and-issue', o?: unknown) => Promise<void> };
const existing = () =>
  ({ ...emptyEditorData(), invoiceId: 'inv-1', version: 3 }) as InvoiceEditorData;

async function failThenRetry(
  retriedAnswer: unknown,
  intent: 'save' | 'save-and-issue' = 'save',
  edit?: (store: ReturnType<typeof renderWithEditorStore>['store']) => void
) {
  const view = renderWithEditorStore(<InvoiceEditorModalContainer />, { initial: existing() });
  if (edit) act(() => edit(view.store));
  updateInvoiceMock.mockResolvedValueOnce(fail('FAILED', 'Could not reach the server.'));
  await act(async () => {
    await (view.store.getState() as unknown as Cmd).save(intent);
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
      } as never),
      'save',
      (store) => store.getState().updateField('notes', 'Edited before the save')
    );
    await screen.findByText('Confirm the new total');
    const calls = updateInvoiceMock.mock.calls.length;
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(updateInvoiceMock.mock.calls.length).toBe(calls);
    expect(view.store.getState().totalsChanged).toBeNull();
    expect(view.store.getState().hasUnsavedChanges).toBe(true);
    expect(view.store.getState().formData.notes).toBe('Edited before the save');
  });
});

// editor-ux T24 (RED, review D4): "Confirm and save" keeps the intent the refused save had.
const TOTALS_CHANGED = () =>
  fail('CONFLICT', 'Total changes.', {
    details: { kind: 'TOTALS_CHANGED', oldTotal: '10.00', newTotal: '11.00' },
  } as never);
const savedAs = (status: 'DRAFT' | 'PENDING') =>
  ok({ id: 'inv-1', version: 4, status, subtotal: 0, taxAmount: 0, total: 0,
    invoiceNumber: 'INV-1', derivedOverdue: false, paidAt: null, issuedDetails: null,
    issueDate: '2026-03-11T00:00:00.000Z', dueDate: '2026-04-10T00:00:00.000Z' });

describe('totals confirmation keeps the intent of the refused save (AC-05c, AC-05d)', () => {
  it('Save and issue answered with changed totals: Confirm and save issues the invoice', async () => {
    const view = renderWithEditorStore(<InvoiceEditorModalContainer />, { initial: existing() });
    updateInvoiceMock.mockResolvedValueOnce(TOTALS_CHANGED());
    await act(async () => {
      await (view.store.getState() as unknown as Cmd).save('save-and-issue');
    });
    await screen.findByText('Confirm the new total');
    updateInvoiceMock.mockResolvedValueOnce(savedAs('PENDING'));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm and save' }));
    await waitFor(() => expect(updateInvoiceMock).toHaveBeenCalledTimes(2));
    expect(updateInvoiceMock).toHaveBeenLastCalledWith(
      'inv-1',
      expect.objectContaining({
        status: 'PENDING',
        confirmedTotals: { oldTotal: '10.00', newTotal: '11.00' },
      })
    );
    await waitFor(() => expect(view.store.getState().storedStatus).toBe('PENDING'));
  });

  it('a failed Save and issue, retried and answered with changed totals: Confirm and save issues the invoice', async () => {
    const view = await failThenRetry(TOTALS_CHANGED(), 'save-and-issue');
    await screen.findByText('Confirm the new total');
    updateInvoiceMock.mockResolvedValueOnce(savedAs('PENDING'));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm and save' }));
    await waitFor(() => expect(updateInvoiceMock).toHaveBeenCalledTimes(3));
    expect(updateInvoiceMock).toHaveBeenLastCalledWith(
      'inv-1',
      expect.objectContaining({
        status: 'PENDING',
        confirmedTotals: { oldTotal: '10.00', newTotal: '11.00' },
      })
    );
    await waitFor(() => expect(view.store.getState().storedStatus).toBe('PENDING'));
  });

  it('a plain Save answered with changed totals still saves as a draft on Confirm and save', async () => {
    const view = renderWithEditorStore(<InvoiceEditorModalContainer />, { initial: existing() });
    updateInvoiceMock.mockResolvedValueOnce(TOTALS_CHANGED());
    await act(async () => {
      await (view.store.getState() as unknown as Cmd).save('save');
    });
    await screen.findByText('Confirm the new total');
    updateInvoiceMock.mockResolvedValueOnce(savedAs('DRAFT'));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm and save' }));
    await waitFor(() => expect(updateInvoiceMock).toHaveBeenCalledTimes(2));
    const sent = updateInvoiceMock.mock.calls[1][1] as { status: string; confirmedTotals: unknown };
    expect(sent.status).not.toBe('PENDING');
    expect(sent.confirmedTotals).toEqual({ oldTotal: '10.00', newTotal: '11.00' });
    await waitFor(() => expect(view.store.getState().storedStatus).toBe('DRAFT'));
  });
});
