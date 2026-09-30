// @vitest-environment jsdom
// T39 (spec.md §5 AC-21; review-2026-09-27.md F-34) —
// docs/features/architecture-hardening/tasks.json T39, cite
// store/invoice-editor-store/use-invoice-editor-store.ts:61.
//
// AC-21 (verbatim): "... that other device performs any action ... the device is treated as a
// Visitor: signed out, shown no data, and nothing is created." Today handleSaveFailure() falls
// through UNAUTHORIZED to the generic `toast.error(result.error)` branch, leaving the stale
// session sitting on the editor screen instead of sending it to sign-in.
//
// RED (T39 not yet implemented): saveInvoice() never navigates anywhere on UNAUTHORIZED, so
// window.location.assign is never called.
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { fail } from '@/types/actions';

const updateInvoiceMock = vi.fn();
vi.mock('@/lib/actions/invoice-actions/invoice-actions', () => ({
  generateInvoiceNumber: vi.fn(),
  createInvoice: vi.fn(),
  updateInvoice: (...args: unknown[]) => updateInvoiceMock(...args),
}));

const toastError = vi.fn();
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: (...args: unknown[]) => toastError(...args) } }));

const { useInvoiceEditorStore } = await import('@/store/invoice-editor-store/use-invoice-editor-store');

describe('invoice editor store — UNAUTHORIZED save routes to sign-in (T39, F-34, AC-21)', () => {
  const assignMock = vi.fn();

  beforeEach(() => {
    useInvoiceEditorStore.getState().reset();
    useInvoiceEditorStore.setState({ invoiceId: 'inv-1' });
    updateInvoiceMock.mockReset();
    toastError.mockReset();
    assignMock.mockReset();
    Object.defineProperty(window, 'location', {
      value: { ...window.location, assign: assignMock },
      writable: true,
    });
  });

  it('sends the device to the cookie-clearing sign-in route instead of only toasting', async () => {
    updateInvoiceMock.mockResolvedValue(fail('UNAUTHORIZED', 'Not signed in.'));

    await useInvoiceEditorStore.getState().saveInvoice();

    expect(assignMock).toHaveBeenCalledWith('/api/auth/clear-session');
  });
});
